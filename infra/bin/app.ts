#!/usr/bin/env node
import { App } from 'aws-cdk-lib';

import {
  ApiStack,
  defaultServerAssetPath,
  defaultEmailSenderAssetPath,
} from '../lib/api-stack.js';
import { MediaCertStack } from '../lib/media-cert-stack.js';
import { MediaStack } from '../lib/media-stack.js';

const app = new App();

const account =
  app.node.tryGetContext('account') ?? process.env.CDK_DEFAULT_ACCOUNT;
const region = app.node.tryGetContext('region') ?? 'eu-west-2';

const serverAssetPath =
  (app.node.tryGetContext('serverAssetPath') as string | undefined) ??
  defaultServerAssetPath;
const emailSenderAssetPath =
  (app.node.tryGetContext('emailSenderAssetPath') as string | undefined) ??
  defaultEmailSenderAssetPath;

// FE origins allowed for CORS.
const appUrlsCtx = app.node.tryGetContext('appUrls') as string | undefined;
const appUrls = appUrlsCtx
  ? appUrlsCtx.split(',').map((s) => s.trim())
  : ['https://dnu0gutn8zy9x.cloudfront.net', 'https://localhost:3000'];

// Cognito OAuth callback URLs: app builds `${API_APP_URI}/api/auth/callback`.
const callbackUrlsCtx = app.node.tryGetContext('callbackUrls') as
  | string
  | undefined;
const callbackUrls = callbackUrlsCtx
  ? callbackUrlsCtx.split(',').map((s) => s.trim())
  : ['https://localhost:3001/api/auth/callback'];

const logoutUrlsCtx = app.node.tryGetContext('logoutUrls') as string | undefined;
const logoutUrls = logoutUrlsCtx
  ? logoutUrlsCtx.split(',').map((s) => s.trim())
  : [
      'https://dnu0gutn8zy9x.cloudfront.net',
      'https://dnu0gutn8zy9x.cloudfront.net/welcome',
      'https://localhost:3000',
      'https://localhost:3000/welcome',
    ];

const cognitoDomainPrefix =
  (app.node.tryGetContext('cognitoDomainPrefix') as string | undefined) ??
  'justcooking';

const ssmSecretsEnv: Record<string, string> = {
  MONGODB_URI: '/justcooking/mongo-uri',
  SESSION_SECRET: '/justcooking/session-secret',
};
const ssmParamNames = Object.values(ssmSecretsEnv);

const googleClientIdParam =
  (app.node.tryGetContext('googleClientIdParam') as string | undefined) ??
  '/justcooking/google-client-id';
// Deploy-time literals (Cognito can't take ssm-secure refs). Read from SSM at
// deploy: -c googleClientSecret=$(aws ssm get-parameter ... --with-decryption).
const googleClientSecret = app.node.tryGetContext('googleClientSecret') as
  | string
  | undefined;
const resendApiKey = app.node.tryGetContext('resendApiKey') as
  | string
  | undefined;

// ---- Media / custom-domain config ----
// Custom domains for the media CDN and the Cognito hosted UI. DNS is in
// Cloudflare; the cert is issued in us-east-1 (CloudFront + Cognito requirement).
const mediaDomain =
  (app.node.tryGetContext('mediaDomain') as string | undefined) ??
  'media-dev.justcook.ing';
const cognitoCustomDomain = app.node.tryGetContext('cognitoCustomDomain') as
  | string
  | undefined; // e.g. idp-dev.justcook.ing — enables the Cognito custom domain when set
// Known name of the image bucket created by JustCookingApi (RETAIN'd).
const imageBucketName =
  (app.node.tryGetContext('imageBucketName') as string | undefined) ??
  'justcookingapi-imagebucket97210811-tj9hed7vwenq';

// us-east-1 ACM cert covering both custom domains (only the domains actually used).
const certDomains = [mediaDomain, ...(cognitoCustomDomain ? [cognitoCustomDomain] : [])];
const certStack = new MediaCertStack(app, 'JustCookingMediaCert', {
  env: { account, region: 'us-east-1' },
  crossRegionReferences: true,
  domainNames: certDomains,
  description: 'JustCooking ACM cert (us-east-1) for media + Cognito custom domains',
});

new ApiStack(app, 'JustCookingApi', {
  env: { account, region },
  crossRegionReferences: true,
  serverAssetPath,
  emailSenderAssetPath,
  ssmParamNames,
  ssmSecretsEnv,
  googleClientIdParam,
  googleClientSecret,
  resendApiKey,
  appUrls,
  callbackUrls,
  logoutUrls,
  cognitoDomainPrefix,
  cognitoCustomDomain,
  cognitoCustomDomainCert: cognitoCustomDomain ? certStack.certificate : undefined,
  appConfig: {
    s3BucketName: (app.node.tryGetContext('s3BucketName') as string) ?? '',
    webAppUri:
      (app.node.tryGetContext('webAppUri') as string) ?? appUrls[0],
    apiAppUri: (app.node.tryGetContext('apiAppUri') as string) ?? '',
    mediaUri:
      (app.node.tryGetContext('mediaUri') as string) ??
      (mediaDomain ? `https://${mediaDomain}` : ''),
    cookieDomain: (app.node.tryGetContext('cookieDomain') as string) ?? '',
    sessionDbName:
      (app.node.tryGetContext('sessionDbName') as string) ?? 'justcooking',
    sessionCollection:
      (app.node.tryGetContext('sessionCollection') as string) ?? 'sessions',
    logLevel: (app.node.tryGetContext('logLevel') as string) ?? 'info',
  },
  description:
    'JustCooking API + Cognito (1:1 with original CFN) — Express on LWA + Function URL, custom email sender',
});

new MediaStack(app, 'JustCookingMedia', {
  env: { account, region },
  crossRegionReferences: true,
  imageBucketName,
  mediaDomain,
  certificate: certStack.certificate,
  description:
    'JustCooking media CloudFront (OAC) fronting the image bucket at ' +
    mediaDomain,
});
