import { Logger } from 'winston';
import { z } from 'zod';

export const newLoggerSchema = z.function().args(z.string(), z.string()).returns(z.instanceof(Logger));

export const ConfigSchema = z.object({
  port: z.string(),
  logLevel: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
  mongoUri: z.string().min(1),
  mongoDbName: z.string().min(1).default('justcooking-dev'),
  sessionDBName: z.string().min(1),
  sessionCollection: z.string().min(1),
  awsRegion: z.string().min(1),
  awsCognitoUserPoolId: z.string().min(1),
  awsCognitoClientId: z.string().min(1),
  awsCognitoDomain: z.string().min(1),
  // Empty on Lambda (uses the execution role via the default credential chain);
  // set locally via .env. Optional so role-based auth passes validation.
  awsAccessKeyId: z.string().optional().default(''),
  awsSecretAccessKey: z.string().optional().default(''),
  awsS3BucketName: z.string().min(1),
  cookieDomain: z.string().min(1),
  TZ: z.string(),
  log: z.instanceof(Logger),
  newLogger: newLoggerSchema,
  webAppUri: z.string().url(),
  apiAppUri: z.string().url(),
  // Media CloudFront (media-dev.justcook.ing) not built yet; allow empty so the
  // API boots without it. Validates as a URL only when a value is present.
  mediaUri: z.union([z.literal(""), z.string().url()]).default(""),
  sessionSecret: z.string().min(1),
});
