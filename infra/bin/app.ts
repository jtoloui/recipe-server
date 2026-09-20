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

// ---- Environment parameterisation (-c env=dev|prod, default dev) ----
// A single context var suffixes/keys ALL environment-specific resources so a
// dev and a prod stack can coexist in one AWS account. Everything is uniformly
// suffixed — dev is NOT special-cased to keep old names.
const env = (app.node.tryGetContext('env') as string | undefined) ?? 'dev';
if (env !== 'dev' && env !== 'prod') {
  throw new Error(`Invalid -c env=${env}: must be 'dev' or 'prod'`);
}
const Env = env === 'prod' ? 'Prod' : 'Dev'; // capitalised for stack IDs

const account =
  app.node.tryGetContext('account') ?? process.env.CDK_DEFAULT_ACCOUNT;
const region = app.node.tryGetContext('region') ?? 'eu-west-2';

// SSM param root: prod nests under /justcooking/prod, dev stays at /justcooking.
const ssmBase = env === 'prod' ? '/justcooking/prod' : '/justcooking';

// Per-env custom-domain defaults (still overridable by their -c context keys).
const domainDefaults =
  env === 'prod'
    ? {
        feDomain: 'www.justcook.ing',
        apiDomain: 'api.justcook.ing',
        cognitoCustomDomain: 'idp.justcook.ing',
        mediaDomain: 'media.justcook.ing',
      }
    : {
        feDomain: 'dev.justcook.ing',
        apiDomain: 'api-dev.justcook.ing',
        cognitoCustomDomain: 'idp-dev.justcook.ing',
        mediaDomain: 'media-dev.justcook.ing',
      };

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
  `justcooking-${env}`;

const ssmSecretsEnv: Record<string, string> = {
  MONGODB_URI: `${ssmBase}/mongo-uri`,
  SESSION_SECRET: `${ssmBase}/session-secret`,
};
const ssmParamNames = Object.values(ssmSecretsEnv);

const googleClientIdParam =
  (app.node.tryGetContext('googleClientIdParam') as string | undefined) ??
  `${ssmBase}/google-client-id`;
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
  domainDefaults.mediaDomain;
const cognitoCustomDomain =
  (app.node.tryGetContext('cognitoCustomDomain') as string | undefined) ??
  domainDefaults.cognitoCustomDomain; // e.g. idp-dev.justcook.ing — enables the Cognito custom domain when set
const feDomain =
  (app.node.tryGetContext('feDomain') as string | undefined) ??
  domainDefaults.feDomain; // e.g. dev.justcook.ing
const apiDomain =
  (app.node.tryGetContext('apiDomain') as string | undefined) ??
  domainDefaults.apiDomain; // e.g. api-dev.justcook.ing
// Cert ARN passed as a literal string (stable, us-east-1) so cross-region consumers
// import by ARN instead of a fragile cross-region CFN export/import.
// Default only applies for dev; prod MUST pass -c certArn at deploy (a token at synth).
const certArn = (app.node.tryGetContext('certArn') as string | undefined) ??
  (env === 'prod'
    ? undefined
    : 'arn:aws:acm:us-east-1:276663280738:certificate/e9a7d8de-73c7-4fa2-90c1-534abd418811');
// Known name of the image bucket created by JustCookingApi (RETAIN'd).
const imageBucketName =
  (app.node.tryGetContext('imageBucketName') as string | undefined) ??
  'justcookingapi-imagebucket97210811-tj9hed7vwenq';

// us-east-1 ACM cert covering the custom domains for THIS env (dev: media-dev,
// idp-dev, dev, api-dev; prod: media, idp, www, api). Literal-ARN import by
// consumers (-c certArn) — no cross-region references.
const certDomains = [
  mediaDomain,
  ...(cognitoCustomDomain ? [cognitoCustomDomain] : []),
  ...(feDomain ? [feDomain] : []),
  ...(apiDomain ? [apiDomain] : []),
];
new MediaCertStack(app, `JustCookingMediaCert${Env}`, {
  env: { account, region: 'us-east-1' },
  domainNames: certDomains,
  description: `JustCooking ACM cert (us-east-1, ${env}) for media + Cognito custom domains`,
});

// At synth, prod may have no certArn yet (passed at deploy). CloudFormation
// tokens are fine for synth, so fall back to an unresolved-style placeholder
// ARN so importing by ARN does not crash the synth.
const certArnForImport =
  certArn ??
  `arn:aws:acm:us-east-1:${account ?? '000000000000'}:certificate/PENDING`;

new ApiStack(app, `JustCookingApi${Env}`, {
  env: { account, region },
  serverAssetPath,
  emailSenderAssetPath,
  envName: env,
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
  cognitoCustomDomainCertArn: cognitoCustomDomain ? certArnForImport : undefined,
  apiDomain,
  apiDomainCertArn: apiDomain ? certArnForImport : undefined,
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
      (app.node.tryGetContext('sessionDbName') as string) ??
      `justcooking-${env}`,
    sessionCollection:
      (app.node.tryGetContext('sessionCollection') as string) ?? 'sessions',
    logLevel: (app.node.tryGetContext('logLevel') as string) ?? 'info',
  },
  description:
    'JustCooking API + Cognito (1:1 with original CFN) — Express on LWA + Function URL, custom email sender',
});

new MediaStack(app, `JustCookingMedia${Env}`, {
  env: { account, region },
  imageBucketName,
  mediaDomain,
  certificateArn: certArnForImport,
  description:
    'JustCooking media CloudFront (OAC) fronting the image bucket at ' +
    mediaDomain,
});
