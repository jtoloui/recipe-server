import express, { Express } from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import https from 'https';
import expressWinston from 'express-winston';
import { auth } from 'express-openid-connect';

import assignId from './src/middleware/requestId';
import logger from './src/logger/winston';
import { connectDB } from './src/db';
import { corsOptions } from './src/utils/cors';
import { config } from './src/utils/authConfig';

// routes
import apiRoutes from './src/routes/apiRoutes';
import authRoutes from './src/routes/authRoutes';
import profileRoutes from './src/routes/profileRoutes';

dotenv.config();

connectDB();
const app: Express = express();
const port = process.env.PORT;

// winston logger
const logLevel = process.env.LOG_LEVEL || 'info';
const winstonLogger = logger(logLevel);

// middleware - auth
app.use(auth(config));

// middleware - custom
app.use(assignId);

// middleware - third party
app.use(helmet());
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

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
      `UserId: ${req.oidc.user?.sub || 'N/A'} - Request ID: ${req.id} - HTTP ${
        req.method
      } ${req.url} - Status: ${res.statusCode} - ${res.statusMessage}`,
  })
);

// Routes
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);
// app.use('/api/profile', profileRoutes);

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
