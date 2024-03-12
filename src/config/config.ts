import winston from 'winston';
import { z, infer } from 'zod';
import dotenv from 'dotenv';

import logger, { newLoggerSchema, newLoggerType } from '../logger/winston';
dotenv.config();

export interface controllerConfig {
  logger: winston.Logger;
}

const ConfigSchema = z.object({
  port: z.string(),
  logLevel: z
    .enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'])
    .default('info'),
  mongoUri: z.string().min(1),
  sessionDBName: z.string().min(1),
  sessionCollection: z.string().min(1),
  awsRegion: z.string().min(1),
  awsCognitoUserPoolId: z.string().min(1),
  awsCognitoClientId: z.string().min(1),
  awsCognitoDomain: z.string().min(1),
  awsAccessKeyId: z.string().min(1),
  awsSecretAccessKey: z.string().min(1),
  cookieDomain: z.string().min(1),
  TZ: z.string(),
  log: z.instanceof(winston.Logger),
  newLogger: newLoggerSchema,
  webAppUri: z.string().url(),
  apiAppUri: z.string().url(),
  sessionSecret: z.string().min(1),
});

export type ConfigType = z.infer<typeof ConfigSchema>;

export class newConfig {
  private config: ConfigType;
  private log: winston.Logger;

  constructor(logger: newLoggerType) {
    this.log = logger('info', 'Config');
    this.config = this.loadConfig(logger);
  }

  loadConfig(logger: newLoggerType): ConfigType {
    this.log.info('Loading config');
    return {
      port: process.env.PORT || '3001',
      logLevel: process.env.LOG_LEVEL as z.infer<
        typeof ConfigSchema.shape.logLevel
      >,
      mongoUri: process.env.MONGODB_URI || '',
      sessionDBName: process.env.MONGODB_SESSION_DB || '',
      sessionCollection: process.env.MONGODB_SESSION_COLLECTION || '',
      awsRegion: process.env.AWS_REGION || '',
      awsCognitoUserPoolId: process.env.AWS_COGNITO_USER_POOL_ID || '',
      awsCognitoClientId: process.env.AWS_COGNITO_CLIENT_ID || '',
      awsCognitoDomain: process.env.AWS_COGNITO_DOMAIN || '',
      awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      cookieDomain: process.env.COOKIE_DOMAIN || '',
      TZ: process.env.TZ || '',
      newLogger: logger,
      log: this.log,
      webAppUri: process.env.WEB_APP_URI || '',
      apiAppUri: process.env.API_APP_URI || '',
      sessionSecret: process.env.SESSION_SECRET || '',
    };
  }

  validate(): this {
    const result = ConfigSchema.safeParse(this.config);

    if (!result.success) {
      this.log.info(result.error);
      this.log.error('Config validation failed');
      process.exit(1);
    }

    this.log.info('Config validated');
    return this;
  }

  getConfig(): ConfigType {
    return this.config;
  }
}
