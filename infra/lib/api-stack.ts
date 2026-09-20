import * as path from 'node:path';

import {
  Duration,
  Fn,
  RemovalPolicy,
  SecretValue,
  Stack,
  StackProps,
  CfnOutput,
} from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface ApiStackProps extends StackProps {
  readonly serverAssetPath: string;
  readonly ssmParamNames: string[];
  readonly ssmSecretsEnv: Record<string, string>;
  /** Google OAuth client id — SSM String param name (public, dynamic ref). */
  readonly googleClientIdParam?: string;
  /** Google OAuth client secret — literal at deploy (Cognito can't ssm-secure ref). */
  readonly googleClientSecret?: string;
  /** Resend API key literal at deploy (from SSM) for the custom email sender. */
  readonly resendApiKey?: string;
  /** Path to the Cognito custom-email-sender Lambda source (index.js + package.json). */
  readonly emailSenderAssetPath: string;
  /** FE origin(s) for CORS. */
  readonly appUrls: string[];
  /** Cognito OAuth callback URLs (app builds `${API}/api/auth/callback`). */
  readonly callbackUrls: string[];
  /** Cognito logout URLs. */
  readonly logoutUrls: string[];
  readonly cognitoDomainPrefix: string;
  /** Optional Cognito custom domain, e.g. idp-dev.justcook.ing (needs a us-east-1 cert). */
  readonly cognitoCustomDomain?: string;
  /** us-east-1 ACM cert for the Cognito custom domain (cross-region ref). */
  readonly cognitoCustomDomainCertArn?: string;
  /** Optional API custom domain, e.g. api-dev.justcook.ing (CloudFront in front of the Function URL). */
  readonly apiDomain?: string;
  /** us-east-1 ACM cert for the API custom domain (cross-region ref). */
  readonly apiDomainCertArn?: string;
  /** Create the recipe-image bucket 1:1 with the original s3-bucket.yaml (default true). If false, reuse an existing bucket named appConfig.s3BucketName. */
  readonly createImageBucket?: boolean;
  /** CORS AllowedOrigins for the image bucket (uploads). */
  readonly imageBucketCorsOrigins?: string[];
  readonly appConfig: {
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
 * JustCooking API + Cognito — matched 1:1 to the original CloudFormation
 * (recipe-server feature/cloudformation cdk/*.yaml):
 *  - Express on Lambda via LWA + Function URL (this REPLACES the old Fargate host).
 *  - Cognito pool: alias attributes email + preferred_username, 6 required+mutable
 *    standard attrs, Google IdP, app client with aws.cognito.signin.user.admin,
 *    SRP+refresh flows, 60min tokens / 1-day refresh.
 *  - CustomEmailSender + PostConfirmation Lambda (KMS-decrypt code, Resend email).
 */
export class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // ---- Recipe image bucket (1:1 with original s3-bucket.yaml) ----
    // Private, versioned, SSE-S3 + bucket keys, all public access blocked, CORS
    // for browser uploads, and a 30-day noncurrent-version expiry on images/.
    const createBucket = props.createImageBucket ?? true;
    const imageBucket = createBucket
      ? new s3.Bucket(this, 'ImageBucket', {
          bucketName: props.appConfig.s3BucketName || undefined,
          blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
          encryption: s3.BucketEncryption.S3_MANAGED,
          bucketKeyEnabled: true,
          versioned: true,
          enforceSSL: true,
          cors: [
            {
              id: 'myCORSRuleId1',
              allowedHeaders: ['x-amz-*'],
              allowedMethods: [
                s3.HttpMethods.GET,
                s3.HttpMethods.PUT,
                s3.HttpMethods.POST,
                s3.HttpMethods.DELETE,
                s3.HttpMethods.HEAD,
              ],
              allowedOrigins: props.imageBucketCorsOrigins ?? props.appUrls,
              exposedHeaders: [
                'x-amz-server-side-encryption',
                'x-amz-request-id',
                'x-amz-id-2',
              ],
              maxAge: 3600,
            },
          ],
          lifecycleRules: [
            {
              id: 'Delete images after 30 days',
              prefix: 'images/',
              enabled: true,
              noncurrentVersionExpiration: Duration.days(30),
              noncurrentVersionsToRetain: 3,
            },
          ],
          removalPolicy: RemovalPolicy.RETAIN,
        })
      : s3.Bucket.fromBucketName(this, 'ImageBucket', props.appConfig.s3BucketName);

    // ---- Allow the media CloudFront distribution (OAC) to read image objects ----
    // The distribution lives in the separate JustCookingMedia stack, so to avoid a
    // cross-stack cycle we grant the CloudFront service principal read access
    // scoped by AWS:SourceArn to any distribution in THIS account. The imported
    // bucket in the media stack cannot take a CDK-managed policy, so it is applied
    // here on the bucket where it is defined.
    if (createBucket) {
      (imageBucket as s3.Bucket).addToResourcePolicy(
        new iam.PolicyStatement({
          sid: 'AllowCloudFrontOACGetObject',
          effect: iam.Effect.ALLOW,
          principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
          actions: ['s3:GetObject'],
          resources: [`${imageBucket.bucketArn}/*`],
          conditions: {
            StringLike: {
              'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/*`,
            },
          },
        }),
      );
    }

    // ---- KMS key for the CustomEmailSender (Cognito encrypts the code with it) ----
    const emailKey = new kms.Key(this, 'EmailSenderKey', {
      alias: 'justcooking-kms',
      description: 'JustCooking Cognito custom email sender code encryption',
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // ---- Custom email sender + PostConfirmation Lambda (ported 1:1, Resend + KMS) ----
    const emailFn = new lambda.Function(this, 'EmailSenderFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(props.emailSenderAssetPath),
      memorySize: 512,
      timeout: Duration.seconds(30),
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        KEY_ARN: emailKey.keyArn,
        KEY_ALIAS: 'alias/justcooking-kms',
        RESEND_API_KEY: props.resendApiKey ?? '',
      },
    });
    emailKey.grantEncryptDecrypt(emailFn);
    // Cognito must be able to invoke the trigger.
    emailFn.addPermission('CognitoInvoke', {
      principal: new iam.ServicePrincipal('cognito-idp.amazonaws.com'),
    });

    // ---- Cognito user pool (1:1 with original CFN) ----
    const userPool = new cognito.UserPool(this, 'UserPoolV2', {
      userPoolName: 'justcooking',
      selfSignUpEnabled: true,
      // Original used AliasAttributes email + preferred_username, case-insensitive.
      // Original AliasAttributes [email, preferred_username] — CDK requires
      // username too when preferredUsername is on; this yields the same alias
      // behaviour (opaque username handle, sign in via email or preferred_username).
      signInAliases: { username: true, email: true, preferredUsername: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      standardAttributes: {
        fullname: { required: true, mutable: true },
        givenName: { required: true, mutable: true },
        familyName: { required: true, mutable: true },
        email: { required: true, mutable: true },
        timezone: { required: true, mutable: true }, // zoneinfo
        lastUpdateTime: { required: true, mutable: true }, // updated_at
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      mfa: cognito.Mfa.OFF,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      customSenderKmsKey: emailKey,
      lambdaTriggers: {
        customEmailSender: emailFn,
        postConfirmation: emailFn,
      },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    userPool.addDomain('HostedUiDomain', {
      cognitoDomain: { domainPrefix: props.cognitoDomainPrefix },
    });

    // Optional Cognito CUSTOM domain (idp-dev.justcook.ing) alongside the prefix
    // domain, 1:1 with the original which defined both. Needs a us-east-1 cert.
    let cognitoCustomDomainTarget: string | undefined;
    if (props.cognitoCustomDomain && props.cognitoCustomDomainCertArn) {
      const cognitoCert = acm.Certificate.fromCertificateArn(this, "CognitoCustomCert", props.cognitoCustomDomainCertArn);
      const customDomain = userPool.addDomain("CustomHostedUiDomain", {
        customDomain: {
          domainName: props.cognitoCustomDomain,
          certificate: cognitoCert,
        },
      });
      cognitoCustomDomainTarget = customDomain.cloudFrontEndpoint;
    }

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
          // 1:1 with original CFN: Cognito requires every REQUIRED standard attr
          // be mapped from each federated IdP; Google has no zoneinfo/updated_at,
          // so the original maps both to the throwaway "expires_in" claim.
          timezone: cognito.ProviderAttribute.other("expires_in"),
          lastUpdateTime: cognito.ProviderAttribute.other("expires_in"),
        },
      });
    }

    const client = userPool.addClient('WebClient', {
      generateSecret: false,
      authFlows: { userSrp: true }, // + refresh implicit
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
          cognito.OAuthScope.COGNITO_ADMIN, // aws.cognito.signin.user.admin
        ],
        callbackUrls: props.callbackUrls,
        logoutUrls: props.logoutUrls,
      },
      accessTokenValidity: Duration.minutes(60),
      idTokenValidity: Duration.minutes(60),
      refreshTokenValidity: Duration.days(1),
      enableTokenRevocation: true,
      preventUserExistenceErrors: true,
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        ...(googleIdp ? [cognito.UserPoolClientIdentityProvider.GOOGLE] : []),
      ],
    });
    if (googleIdp) client.node.addDependency(googleIdp);

    const cognitoDomain = `${props.cognitoDomainPrefix}.auth.${this.region}.amazoncognito.com`;

    // ---- API Lambda (Express via LWA) ----
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
        SSM_SECRETS: Object.entries(props.ssmSecretsEnv)
          .map(([k, v]) => `${k}=${v}`)
          .join(','),
        AWS_COGNITO_USER_POOL_ID: userPool.userPoolId,
        AWS_COGNITO_CLIENT_ID: client.userPoolClientId,
        AWS_COGNITO_DOMAIN: cognitoDomain,
        WEB_APP_URI: props.appConfig.webAppUri,
        API_APP_URI: props.appConfig.apiAppUri,
        MEDIA_URI: props.appConfig.mediaUri,
        COOKIE_DOMAIN: props.appConfig.cookieDomain,
        MONGODB_SESSION_DB: props.appConfig.sessionDbName,
        MONGODB_SESSION_COLLECTION: props.appConfig.sessionCollection,
        AWS_S3_BUCKET_NAME: imageBucket.bucketName,
        LOG_LEVEL: props.appConfig.logLevel,
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

    imageBucket.grantReadWrite(fn);

    // The API calls cognito-idp:AdminGetUser (isAuthenticated) against the pool
    // using the Lambda role. Without this grant the SDK call is rejected with
    // "The security token included in the request is invalid."
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminUserGlobalSignOut",
          "cognito-idp:AdminInitiateAuth",
          "cognito-idp:AdminRespondToAuthChallenge",
        ],
        resources: [userPool.userPoolArn],
      }),
    );

    // CORS is handled by the Express app (src/utils/cors.ts, credentialed +
    // keyed to WEB_APP_URI). Do NOT also set CORS on the Function URL, or both
    // layers emit Access-Control-Allow-Origin and the browser rejects the pair.
    const fnUrl = fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    // Optional API custom domain: CloudFront in front of the Function URL, so
    // api-dev.justcook.ing shares the justcook.ing parent with the FE (required
    // for the .justcook.ing session cookie + SameSite to work across FE↔API).
    // Function URLs cannot take a custom domain directly, hence the distribution.
    if (props.apiDomain && props.apiDomainCertArn) {
      const apiCert = acm.Certificate.fromCertificateArn(this, "ApiCustomCert", props.apiDomainCertArn);
      const fnUrlHost = Fn.select(2, Fn.split('/', fnUrl.url)); // strip https:// and trailing /
      const apiDist = new cloudfront.Distribution(this, 'ApiDistribution', {
        comment: 'JustCooking API custom domain -> Function URL',
        domainNames: [props.apiDomain],
        certificate: apiCert,
        minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
        defaultBehavior: {
          origin: new origins.HttpOrigin(fnUrlHost, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            customHeaders: {},
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          // Forward everything except Host (Function URL rejects a foreign Host header).
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      });
      new CfnOutput(this, 'ApiDistributionDomain', {
        value: apiDist.distributionDomainName,
        description:
          'Add a Cloudflare DNS-only CNAME: api-dev.justcook.ing -> this value',
      });
      new CfnOutput(this, 'ApiCustomDomain', { value: props.apiDomain });
    }

    new CfnOutput(this, 'ApiFunctionUrl', { value: fnUrl.url });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: client.userPoolClientId });
    new CfnOutput(this, 'CognitoHostedUiDomain', { value: cognitoDomain });
    new CfnOutput(this, 'EmailKmsKeyArn', { value: emailKey.keyArn });
    if (cognitoCustomDomainTarget) {
      new CfnOutput(this, "CognitoCustomDomainTarget", {
        value: cognitoCustomDomainTarget,
        description:
          "Add a Cloudflare DNS-only CNAME: idp-dev.justcook.ing -> this value",
      });
    }
  }
}

export const defaultServerAssetPath = path.resolve(
  __dirname,
  '..',
  'lambda-dist'
);
export const defaultEmailSenderAssetPath = path.resolve(
  __dirname,
  '..',
  'lambda-email'
);
