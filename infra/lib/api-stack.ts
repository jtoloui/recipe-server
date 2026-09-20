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
   * (values live only in Parameter Store, never in code/env/git). The Lambda is
   * granted ssm:GetParameter on exactly these.
   */
  readonly ssmParamNames: string[];
  /** Google OAuth client id/secret — SSM SecureString param names, resolved at deploy. */
  readonly googleClientIdParam?: string;
  readonly googleClientSecretParam?: string;
  /** FE origin(s) for Cognito callback/logout URLs + CORS, e.g. https://www.justcook.ing. */
  readonly appUrls: string[];
  /** Prefix for the Cognito hosted-UI domain, e.g. "justcooking". */
  readonly cognitoDomainPrefix: string;
}

/**
 * JustCooking API — the existing Express server on a single Lambda via the AWS
 * Lambda Web Adapter (no code change), exposed by a Function URL (no API
 * Gateway per-request charge). Plus a FRESH Cognito user pool with Google IdP.
 *
 * Cost posture: ARM64 Graviton, no VPC/NAT, Function URL (free), short log
 * retention, SSM SecureString secrets (AWS-managed KMS key = no CMK fee) read
 * once per cold start and cached in module scope by the app.
 */
export class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

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
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/bootstrap',
        AWS_LWA_PORT: '3001',
        PORT: '3001',
        NODE_ENV: 'production',
      },
    });

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

    const fnUrl = fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: props.appUrls,
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ['*'],
        allowCredentials: true,
      },
    });

    // ---- Fresh Cognito user pool (per decision) ----
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

    // Google IdP — id + secret resolved from SSM SecureString at deploy time.
    let googleIdp: cognito.UserPoolIdentityProviderGoogle | undefined;
    if (props.googleClientIdParam && props.googleClientSecretParam) {
      googleIdp = new cognito.UserPoolIdentityProviderGoogle(this, 'Google', {
        userPool,
        // client id is not secret; resolve it from SSM at deploy via a dynamic ref
        clientId: `{{resolve:ssm:${props.googleClientIdParam}}}`,
        clientSecretValue: SecretValue.ssmSecure(props.googleClientSecretParam),
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
      value: `${props.cognitoDomainPrefix}.auth.${this.region}.amazoncognito.com`,
      description:
        'Add https://<this>/oauth2/idpresponse to the Google OAuth client redirect URIs',
    });
  }
}

/** Staged Lambda asset (built server + run.sh + prod node_modules). */
export const defaultServerAssetPath = path.resolve(
  __dirname,
  '..',
  '..',
  'lambda-dist'
);
