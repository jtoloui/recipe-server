#!/usr/bin/env node
import { App } from 'aws-cdk-lib';

import { ApiStack, defaultServerAssetPath } from '../lib/api-stack.js';

const app = new App();

const account =
  app.node.tryGetContext('account') ?? process.env.CDK_DEFAULT_ACCOUNT;
const region = app.node.tryGetContext('region') ?? 'eu-west-2';

const serverAssetPath =
  (app.node.tryGetContext('serverAssetPath') as string | undefined) ??
  defaultServerAssetPath;

const appUrlsCtx = app.node.tryGetContext('appUrls') as string | undefined;
const appUrls = appUrlsCtx
  ? appUrlsCtx.split(',').map((s) => s.trim())
  : ['https://d3nrkbp02xztg2.cloudfront.net'];

const cognitoDomainPrefix =
  (app.node.tryGetContext('cognitoDomainPrefix') as string | undefined) ??
  'justcooking';

// ENV_NAME -> SSM SecureString param name. Server's lambda-bootstrap hydrates
// these into process.env at cold start.
const ssmSecretsEnv: Record<string, string> = {
  MONGODB_URI: '/justcooking/mongo-uri',
  SESSION_SECRET: '/justcooking/session-secret',
};
const ssmParamNames = Object.values(ssmSecretsEnv);

const googleClientIdParam =
  (app.node.tryGetContext('googleClientIdParam') as string | undefined) ??
  '/justcooking/google-client-id';
// Secret is a deploy-time literal (Cognito can't ref ssm-secure). Pass via
// -c googleClientSecret=... (from secrets.env), never committed.
const googleClientSecret = app.node.tryGetContext('googleClientSecret') as
  | string
  | undefined;

const primaryAppUrl = appUrls[0];

new ApiStack(app, 'JustCookingApi', {
  env: { account, region },
  serverAssetPath,
  ssmParamNames,
  ssmSecretsEnv,
  googleClientIdParam,
  googleClientSecret,
  appUrls,
  cognitoDomainPrefix,
  appConfig: {
    webAppUri: (app.node.tryGetContext('webAppUri') as string) ?? primaryAppUrl,
    apiAppUri: (app.node.tryGetContext('apiAppUri') as string) ?? '',
    mediaUri: (app.node.tryGetContext('mediaUri') as string) ?? '',
    cookieDomain: (app.node.tryGetContext('cookieDomain') as string) ?? '',
    sessionDbName:
      (app.node.tryGetContext('sessionDbName') as string) ?? 'sessions',
    sessionCollection:
      (app.node.tryGetContext('sessionCollection') as string) ?? 'sessions',
    s3BucketName: (app.node.tryGetContext('s3BucketName') as string) ?? '',
    logLevel: (app.node.tryGetContext('logLevel') as string) ?? 'info',
  },
  description:
    'JustCooking API — Express on Lambda Web Adapter + Function URL + Cognito',
});
