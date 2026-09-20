#!/usr/bin/env node
import { App } from 'aws-cdk-lib';

import { ApiStack, defaultServerAssetPath } from '../lib/api-stack.js';

const app = new App();

const account =
  app.node.tryGetContext('account') ?? process.env.CDK_DEFAULT_ACCOUNT;
// Match the FE + bootstrap region unless overridden.
const region = app.node.tryGetContext('region') ?? 'us-east-1';

const serverAssetPath =
  (app.node.tryGetContext('serverAssetPath') as string | undefined) ??
  defaultServerAssetPath;

// FE origins allowed for CORS + Cognito callback/logout.
const appUrlsCtx = app.node.tryGetContext('appUrls') as string | undefined;
const appUrls = appUrlsCtx
  ? appUrlsCtx.split(',').map((s) => s.trim())
  : ['https://d3nrkbp02xztg2.cloudfront.net'];

const cognitoDomainPrefix =
  (app.node.tryGetContext('cognitoDomainPrefix') as string | undefined) ??
  'justcooking';

// SSM SecureString param names the server reads at runtime (values set separately).
const ssmParamNamesCtx = app.node.tryGetContext('ssmParamNames') as
  | string
  | undefined;
const ssmParamNames = ssmParamNamesCtx
  ? ssmParamNamesCtx.split(',').map((s) => s.trim())
  : [
      '/justcooking/mongo-uri',
      '/justcooking/session-secret',
      '/justcooking/aws-s3-access-key-id',
      '/justcooking/aws-s3-secret-access-key',
    ];

const googleClientIdParam = app.node.tryGetContext('googleClientIdParam') as
  | string
  | undefined;
const googleClientSecretParam = app.node.tryGetContext(
  'googleClientSecretParam'
) as string | undefined;

new ApiStack(app, 'JustCookingApi', {
  env: { account, region },
  serverAssetPath,
  ssmParamNames,
  googleClientIdParam,
  googleClientSecretParam,
  appUrls,
  cognitoDomainPrefix,
  description: 'JustCooking API — Express on Lambda Web Adapter + Function URL + Cognito',
});
