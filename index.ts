import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import express, { Express } from 'express';
import session from 'express-session';
import expressWinston from 'express-winston';
import fs from 'fs';
import helmet from 'helmet';
import https from 'https';

import { connectDB } from './src/db';
import logger from './src/logger/winston';
import assignId from './src/middleware/requestId';
// routes
import apiRoutes from './src/routes/apiRoutes';
import authRoutes from './src/routes/authRoutes';
import { corsOptions } from './src/utils/cors';

dotenv.config();

connectDB();
const app: Express = express();
const port = process.env.PORT;

const domain = process.env.API_APP_URI || '';
const domainParts = domain.split('.');
const domainRoot = domainParts.slice(1).join('.');
const domainRootWithDot = `.${domainRoot}`;
// winston logger
const logLevel = process.env.LOG_LEVEL || 'info';
const winstonLogger = logger(logLevel);

// middleware - custom
app.use(assignId);

// middleware - third party
app.use(helmet());
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

app.use(
  session({
    secret: process.env.AUTH0_SECRET || '', // used to sign the session ID cookie
    resave: false, // forces the session to be saved back to the session store
    saveUninitialized: false, // forces a session that is "uninitialized" to be saved to the store
    cookie: { secure: true, domain: domainRootWithDot }, // true in production to ensure session ID is sent over HTTPS
  })
);
app.use((req, res, next) => {
  const sessionCookie = req.session?.user?.tokens.AccessToken;
  if (sessionCookie && req.cookies.app_session !== sessionCookie) {
    res.cookie('app_session', sessionCookie, { httpOnly: true, secure: true });
  }
  next();
});

// Middleware to log HTTP requests
app.use(
  expressWinston.logger({
    winstonInstance: winstonLogger,
    meta: false,
    level: (_, res) => {
      let level = 'info';
      if (res.statusCode >= 400 && res.statusCode < 500) {
        level = 'warn';
      } else if (res.statusCode >= 500) {
        level = 'error';
      }
      return level;
    },
    msg: (req, res) =>
      `UserId: ${req.session?.user?.sub || 'N/A'} - Request ID: ${
        req.id
      } - HTTP ${req.method} ${req.url} - Status: ${res.statusCode} - ${
        res.statusMessage
      }`,
  })
);

// Routes
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);

if (process.env.NODE_ENV !== 'production') {
  const key = fs.readFileSync('./certs/localhost-key.pem');
  const cert = fs.readFileSync('./certs/localhost.pem');

  https.createServer({ key, cert }, app).listen(port, () => {
    console.log(`⚡️[server]: Server is running at https://localhost:${port}`);
  });
} else {
  app.listen(port, () => {
    console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
  });
}
