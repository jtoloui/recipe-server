import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Express, NextFunction, Request, Response } from 'express';
import session from 'express-session';
import expressWinston from 'express-winston';
import fs from 'fs';
import helmet from 'helmet';
import https from 'https';
import * as uuid from 'uuid';

import { newConfig } from './src/config/config';
import { DBConnection } from './src/db';
import logger from './src/logger/winston';
import assignId from './src/middleware/requestId';
// routes
import { apiRoutes } from './src/routes/apiRoutes';
import { corsOptions } from './src/utils/cors';

const config = new newConfig(logger, process.env.LOG_LEVEL).validate().getConfig();

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

// middleware - third party
app.use(helmet());
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

app.use(
  session({
    genid: () => {
      return uuid.v4();
    },
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

app.use(assignId);

// Middleware to log HTTP Outbound requests
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
    // msg: (req, res) => {
    //   // res.on('finish', () => {});
    //   return `UserId: ${req.session?.user?.sub || 'N/A'} - Request ID: ${req.id} - Session ID: ${
    //     req.sessionID
    //   } - HTTP (Outbound) ${req.method} ${req.url} - Status: ${res.statusCode} - ${res.statusMessage} - ${res.responseTime}}ms`;
    // },
  }),
);
// Middleware to log HTTP Inbound requests
app.use((req: Request, res: Response, next: NextFunction) => {
  const logger = config.newLogger(logLevel, 'Routes');
  const start = process.hrtime();
  const calculateResponseTime = () => {
    const diff = process.hrtime(start);
    return (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(3); // Convert to milliseconds with three decimal places
  };

  logger.info(
    `UserId: ${req.session?.user?.sub || 'N/A'} - Request ID: ${req.id} - Session ID: ${
      req.sessionID
    } - HTTP (Inbound) ${req.method} ${req.url}`,
  );

  res.on('finish', () => {
    logger.info(
      `UserId: ${req.session?.user?.sub || 'N/A'} - Request ID: ${req.id} - Session ID: ${
        req.sessionID
      } - HTTP (Outbound) ${req.method} ${req.url} - Status: ${res.statusCode} - ${res.statusMessage} - ${calculateResponseTime()}ms`,
    );
  });
  next();
});
// Routes
app.use('/api', apiRoutes(config));

if (process.env.NODE_ENV !== 'production') {
  const key = fs.readFileSync('./certs/localhost-key.pem');
  const cert = fs.readFileSync('./certs/localhost.pem');

  https.createServer({ key, cert }, app).listen(port, () => {
    serverLogger.info(`⚡️[server]: Server is running at https://localhost:${port}`);
  });
} else {
  app.listen(port, () => {
    serverLogger.info(`⚡️[server]: Server is running at http://localhost:${port}`);
  });
}
