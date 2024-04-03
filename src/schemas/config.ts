import { Logger } from 'winston';
import { z } from 'zod';

export const newLoggerSchema = z.function().args(z.string(), z.string()).returns(z.instanceof(Logger));

export const ConfigSchema = z.object({
  port: z.string(),
  logLevel: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
  mongoUri: z.string().min(1),
  sessionDBName: z.string().min(1),
  sessionCollection: z.string().min(1),
  awsRegion: z.string().min(1),
  awsCognitoUserPoolId: z.string().min(1),
  awsCognitoClientId: z.string().min(1),
  awsCognitoDomain: z.string().min(1),
  awsAccessKeyId: z.string().min(1),
  awsSecretAccessKey: z.string().min(1),
  awsS3BucketName: z.string().min(1),
  cookieDomain: z.string().min(1),
  TZ: z.string(),
  log: z.instanceof(Logger),
  newLogger: newLoggerSchema,
  webAppUri: z.string().url(),
  apiAppUri: z.string().url(),
  mediaUri: z.string().url(),
  sessionSecret: z.string().min(1),
});
