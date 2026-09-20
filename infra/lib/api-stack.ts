import * as path from 'node:path';

import {
  Duration,
  RemovalPolicy,
  SecretValue,
  Stack,
  StackProps,
  CfnOutput,
} from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface ApiStackProps extends StackProps {
  /** Absolute path to the staged Lambda asset (built server + run.sh + node_modules). */
  readonly serverAssetPath: string;
  /**
   * SSM SecureString parameter NAMES the Lambda reads secrets from at runtime
   * (values live only in Parameter Store, never in code/env/git).
   */
  readonly ssmParamNames: string[];
  /**
   * ENV_NAME -> SSM param name mapping the server's lambda-bootstrap hydrates
   * into process.env at cold start (SSM_SECRETS). Keys are the env vars the app
   * reads; values must be a subset of ssmParamNames.
   */
  readonly ssmSecretsEnv: Record<string, string>;
  /** Google OAuth client id/secret — SSM SecureString param names, resolved at deploy. */
  /** Google OAuth client id — SSM String param name (public, resolved via dynamic ref). */
  readonly googleClientIdParam?: string;
  /** Google OAuth client secret — LITERAL value (Cognito IdP can't take an ssm-secure ref);
   *  supplied at deploy from the local secrets.env, never committed. */
  readonly googleClientSecret?: string;
  /** FE origin(s) for Cognito callback/logout URLs + CORS, e.g. https://www.justcook.ing. */
  readonly appUrls: string[];
  /** Prefix for the Cognito hosted-UI domain, e.g. "justcooking". */
  readonly cognitoDomainPrefix: string;
  /** Non-secret app config passed as plain Lambda env. */
  readonly appConfig: {
    /** Existing S3 bucket for recipe images (Lambda role is granted RW on it). */
    s3BucketName: string;
    webAppUri: string;
    apiAppUri: string;
    mediaUri: string;
    cookieDomain: string;
    sessionDbName: string;
    sessionCollection: string;
    logLevel: string;
  };
}

/**
 * JustCooking API — the existing Express server on a single Lambda via the AWS
 * Lambda Web Adapter (no code change), exposed by a Function URL. Plus a FRESH
 * Cognito user pool with Google IdP.
 *
 * Cost posture: ARM64, no VPC/NAT, Function URL (free), short logs, SSM
 * SecureString secrets (AWS-managed KMS key = no CMK fee), cached per cold start.
 */
export class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // ---- Cognito FIRST so the Lambda env can reference its ids ----
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'justcooking',
      selfSignUpEnabled: true,
      signInAliases: { email: true, username: true },
      autoVerify: { email: true },
      standardAttributes: {
        givenName: { required: false, mutable: true },
        familyName: { required: false, mutable: true },
        fullname: { required: false, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    userPool.addDomain('HostedUiDomain', {
      cognitoDomain: { domainPrefix: props.cognitoDomainPrefix },
    });

    let googleIdp: cognito.UserPoolIdentityProviderGoogle | undefined;
    if (props.googleClientIdParam && props.googleClientSecret) {
      googleIdp = new cognito.UserPoolIdentityProviderGoogle(this, 'Google', {
        userPool,
        clientId: `{{resolve:ssm:${props.googleClientIdParam}}}`,
        clientSecretValue: SecretValue.unsafePlainText(props.googleClientSecret),
        scopes: ['profile', 'email', 'openid'],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
          fullname: cognito.ProviderAttribute.GOOGLE_NAME,
        },
      });
    }

    const client = userPool.addClient('WebClient', {
      generateSecret: false,
      authFlows: { userPassword: true, userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: props.appUrls.map((u) => `${u}/callback`),
        logoutUrls: props.appUrls,
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        ...(googleIdp ? [cognito.UserPoolClientIdentityProvider.GOOGLE] : []),
      ],
    });
    if (googleIdp) client.node.addDependency(googleIdp);

    const cognitoDomain = `${props.cognitoDomainPrefix}.auth.${this.region}.amazoncognito.com`;

    // ---- Lambda (Express via LWA) ----
    const lwaLayerArn =
      (this.node.tryGetContext('lwaLayerArn') as string | undefined) ??
      `arn:aws:lambda:${this.region}:753240598075:layer:LambdaAdapterLayerArm64:24`;

    const fn = new lambda.Function(this, 'ApiFn', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'run.sh',
      code: lambda.Code.fromAsset(props.serverAssetPath),
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(this, 'LwaLayer', lwaLayerArn),
      ],
      memorySize: 512,
      timeout: Duration.seconds(30),
      logRetention: logs.RetentionDays.TWO_WEEKS,
      environment: {
        // LWA
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/bootstrap',
        AWS_LWA_PORT: '3001',
        PORT: '3001',
        NODE_ENV: 'production',
        // Secrets hydrated from SSM at cold start (ENV=param mapping).
        SSM_SECRETS: Object.entries(props.ssmSecretsEnv)
          .map(([k, v]) => `${k}=${v}`)
          .join(','),
        // Non-secret config from this stack's own Cognito resources.
        AWS_COGNITO_USER_POOL_ID: userPool.userPoolId,
        AWS_COGNITO_CLIENT_ID: client.userPoolClientId,
        AWS_COGNITO_DOMAIN: cognitoDomain,
        WEB_APP_URI: props.appConfig.webAppUri,
        API_APP_URI: props.appConfig.apiAppUri,
        MEDIA_URI: props.appConfig.mediaUri,
        COOKIE_DOMAIN: props.appConfig.cookieDomain,
        MONGODB_SESSION_DB: props.appConfig.sessionDbName,
        MONGODB_SESSION_COLLECTION: props.appConfig.sessionCollection,
        AWS_S3_BUCKET_NAME: props.appConfig.s3BucketName,
        LOG_LEVEL: props.appConfig.logLevel,
      },
    });

    // Read exactly the named SSM params + decrypt via the AWS-managed SSM key only.
    if (props.ssmParamNames.length > 0) {
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['ssm:GetParameter', 'ssm:GetParameters'],
          resources: props.ssmParamNames.map(
            (n) =>
              `arn:aws:ssm:${this.region}:${this.account}:parameter${
                n.startsWith('/') ? n : `/${n}`
              }`
          ),
        })
      );
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['kms:Decrypt'],
          resources: ['*'],
          conditions: {
            StringEquals: {
              'kms:ViaService': `ssm.${this.region}.amazonaws.com`,
            },
          },
        })
      );
    }

    // Grant the Lambda role RW on the recipe-images bucket (no static keys).
    if (props.appConfig.s3BucketName) {
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            's3:PutObject',
            's3:GetObject',
            's3:DeleteObject',
            's3:ListBucket',
          ],
          resources: [
            `arn:aws:s3:::${props.appConfig.s3BucketName}`,
            `arn:aws:s3:::${props.appConfig.s3BucketName}/*`,
          ],
        })
      );
    }

    const fnUrl = fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: props.appUrls,
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ['*'],
        allowCredentials: true,
      },
    });

    new CfnOutput(this, 'ApiFunctionUrl', {
      value: fnUrl.url,
      description:
        'API endpoint — point Cloudflare api.* CNAME / FE VITE_API_URI here',
    });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', {
      value: client.userPoolClientId,
    });
    new CfnOutput(this, 'CognitoHostedUiDomain', {
      value: cognitoDomain,
      description:
        'Add https://<this>/oauth2/idpresponse to the Google OAuth client redirect URIs',
    });
  }
}

/** Staged Lambda asset (built server + run.sh + prod node_modules). */
export const defaultServerAssetPath = path.resolve(
  __dirname,
  '..',
  'lambda-dist'
);
