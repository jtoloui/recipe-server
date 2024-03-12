import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Express } from 'express';
import session from 'express-session';
import expressWinston from 'express-winston';
import fs from 'fs';
import helmet from 'helmet';
import https from 'https';

import { DBConnection } from './src/db';
import logger from './src/logger/winston';
import assignId from './src/middleware/requestId';
// routes
import { apiRoutes } from './src/routes/apiRoutes';
import authRoutes from './src/routes/authRoutes';
import { corsOptions } from './src/utils/cors';
import { newConfig } from './src/config/config';

const config = new newConfig(logger).validate().getConfig();

const dbConnection = new DBConnection(config);
dbConnection.connectDB();
dbConnection.connectSessionStore();
const store = dbConnection.getSessionStore();

const app: Express = express();
const port = process.env.PORT;

// allow proxy from cloudfare
app.set('trust proxy', 1);

const domain = config.apiAppUri;
const domainParts = domain.split('.');
const domainRoot = domainParts.slice(1).join('.');
const domainRootWithDot = `.${domainRoot}`;
// winston logger
const logLevel = config.logLevel;
const serverLogger = config.newLogger(logLevel, 'server');
const winstonLoggerMiddleware = config.newLogger(logLevel, 'Routes');

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
    secret: config.sessionSecret || '',
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      secure: true,
      httpOnly: true,
      domain: `.${config.cookieDomain}`,
      sameSite: 'lax',
    },
    store: store,
    resave: false,
    saveUninitialized: false,
  }),
);

// Middleware to log HTTP requests
app.use(
  expressWinston.logger({
    winstonInstance: winstonLoggerMiddleware,
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
  }),
);

// Routes
app.use('/auth', authRoutes);
app.use('/api', apiRoutes(config));

if (process.env.NODE_ENV !== 'production') {
  const key = fs.readFileSync('./certs/localhost-key.pem');
  const cert = fs.readFileSync('./certs/localhost.pem');

  https.createServer({ key, cert }, app).listen(port, () => {
    serverLogger.info(
      `⚡️[server]: Server is running at https://localhost:${port}`,
    );
  });
} else {
  app.listen(port, () => {
    serverLogger.info(
      `⚡️[server]: Server is running at http://localhost:${port}`,
    );
  });
}
