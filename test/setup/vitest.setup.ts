import { afterAll, beforeAll } from 'vitest';

import { startMemoryMongo, stopMemoryMongo } from './mongo';

// Global env + in-memory Mongo for every test file. Individual integration
// tests connect mongoose to process.env.MONGODB_URI (set here) themselves,
// or use the exported helpers in ./mongo directly.
beforeAll(async () => {
  const uri = await startMemoryMongo();
  process.env.MONGODB_URI = uri;
  process.env.NODE_ENV = 'test';
  process.env.TZ = 'UTC';
  process.env.LOG_LEVEL = 'error';
  // Fake, non-secret values so config validation passes in tests.
  process.env.MONGODB_SESSION_DB ??= 'sessions';
  process.env.MONGODB_SESSION_COLLECTION ??= 'sessions';
  process.env.SESSION_SECRET ??= 'test-secret';
  process.env.COOKIE_DOMAIN ??= 'localhost';
  process.env.API_APP_URI ??= 'https://api.localhost';
  process.env.WEB_APP_URI ??= 'http://localhost:3000';
  process.env.MEDIA_URI ??= 'https://media.localhost';
  process.env.AWS_REGION ??= 'eu-west-2';
  process.env.AWS_ACCESS_KEY_ID ??= 'test';
  process.env.AWS_SECRET_ACCESS_KEY ??= 'test';
  process.env.AWS_S3_BUCKET_NAME ??= 'test-bucket';
  process.env.AWS_CLOUDFRONT_DOMAIN ??= 'test.cloudfront.net';
  process.env.AWS_COGNITO_CLIENT_ID ??= 'test-client';
  process.env.AWS_COGNITO_USER_POOL_ID ??= 'eu-west-2_test';
  process.env.AWS_COGNITO_DOMAIN ??= 'test.auth';
  process.env.GOOGLE_CLIENT_ID ??= 'test';
  process.env.GOOGLE_CLIENT_SECRET ??= 'test';
});

afterAll(async () => {
  await stopMemoryMongo();
});
