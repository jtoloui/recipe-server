import bodyParser from 'body-parser';
import MongoDBStore from 'connect-mongodb-session';
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
const MongoDBStores = MongoDBStore(session);

connectDB();
const app: Express = express();
const port = process.env.PORT;

// allow proxy from cloudfare
app.set('trust proxy', 1);
// Setup MongoDB session store
const mongoUri = process.env.MONGODB_URI || '';

const store = new MongoDBStores({
  uri: mongoUri,
  databaseName: 'recipe-session',
  collection: 'sessions',
  expires: 1000 * 60 * 60 * 24 * 7, // 1 week
});

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
    secret: process.env.AUTH0_SECRET || '',
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      secure: true,
      httpOnly: true,
      domain: `.${process.env.COOKIE_DOMAIN}`,
      sameSite: 'lax',
    },
    store: store,
    resave: false,
    saveUninitialized: false,
  })
);

app.use((req, res, next) => {
  const sessionCookie = req.session?.user?.tokens.AccessToken;
  if (sessionCookie && req.cookies.app_session !== sessionCookie) {
    res.cookie('app_session', sessionCookie, {
      httpOnly: true,
      secure: true,
      domain: domainRootWithDot,
    });
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
