import dotenv from 'dotenv';
import winston from 'winston';
import { z } from 'zod';

import { newLoggerType } from '../logger/winston';
import { ConfigSchema } from '../schemas/config';
import { ConfigType } from '../types/config/config';

dotenv.config();

export class newConfig {
  private config: ConfigType;
  private log: winston.Logger;

  constructor(logger: newLoggerType, cfgLogLvl: string = 'info') {
    this.log = logger(cfgLogLvl, 'Config');
    this.config = this.loadConfig(logger);
  }

  loadConfig(logger: newLoggerType): ConfigType {
    return {
      port: process.env.PORT || '3001',
      logLevel: process.env.LOG_LEVEL as z.infer<typeof ConfigSchema.shape.logLevel>,
      mongoUri: process.env.MONGODB_URI || '',
      mongoDbName: process.env.MONGODB_DB || 'justcooking-dev',
      sessionDBName: process.env.MONGODB_SESSION_DB || '',
      sessionCollection: process.env.MONGODB_SESSION_COLLECTION || '',
      awsRegion: process.env.AWS_REGION || '',
      awsCognitoUserPoolId: process.env.AWS_COGNITO_USER_POOL_ID || '',
      awsCognitoClientId: process.env.AWS_COGNITO_CLIENT_ID || '',
      awsCognitoDomain: process.env.AWS_COGNITO_DOMAIN || '',
      // On Lambda, AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are RESERVED runtime
      // vars holding the execution role's TEMPORARY creds (ASIA...), which are
      // only valid together with AWS_SESSION_TOKEN. Copying just key+secret (as
      // the SDK client builders do) drops the session token -> InvalidAccessKeyId.
      // So on Lambda we resolve these to '' and let every SDK client fall back to
      // the default provider chain (the role, with its session token). Static
      // keys remain supported for LOCAL dev only. AWS_LAMBDA_FUNCTION_NAME is set
      // iff running inside Lambda.
      awsAccessKeyId: process.env.AWS_LAMBDA_FUNCTION_NAME
        ? ''
        : process.env.AWS_ACCESS_KEY_ID || '',
      awsSecretAccessKey: process.env.AWS_LAMBDA_FUNCTION_NAME
        ? ''
        : process.env.AWS_SECRET_ACCESS_KEY || '',
      awsS3BucketName: process.env.AWS_S3_BUCKET_NAME || '',
      cookieDomain: process.env.COOKIE_DOMAIN || '',
      TZ: process.env.TZ || '',
      newLogger: logger,
      log: this.log,
      webAppUri: process.env.WEB_APP_URI || '',
      apiAppUri: process.env.API_APP_URI || '',
      mediaUri: process.env.MEDIA_URI || '',
      sessionSecret: process.env.SESSION_SECRET || '',
    };
  }

  validate(): this {
    const result = ConfigSchema.safeParse(this.config);

    if (!result.success) {
      this.log.error('Config validation failed');
      this.log.debug(`validating config failed:`, result.error);
      process.exit(1);
    }

    this.log.info('Config validated');
    return this;
  }

  getConfig(): ConfigType {
    return this.config;
  }
}
