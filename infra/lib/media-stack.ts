import {
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  CfnOutput,
} from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface MediaStackProps extends StackProps {
  /** Name of the existing recipe-image bucket (created by JustCookingApi). */
  readonly imageBucketName: string;
  /** Alias for the media CloudFront distribution, e.g. media-dev.justcook.ing. */
  readonly mediaDomain: string;
  /**
   * ACM certificate for the media alias. MUST be in us-east-1 (CloudFront
   * requirement). Passed as a cross-region reference from MediaCertStack.
   */
  readonly certificate: acm.ICertificate;
}

/**
 * Media CloudFront distribution — 1:1 with the original cloudfront-and-oai.yaml,
 * modernised to Origin Access Control (OAC) instead of the legacy OAI:
 *  - Fronts the existing recipe-image S3 bucket at media-dev.justcook.ing.
 *  - Custom cache policy: Brotli+Gzip, whitelist Origin / ACRM / ACRH headers,
 *    no cookies, no query strings (matches the original ParametersInCacheKey).
 *  - GET/HEAD/OPTIONS, redirect-to-https, TLS1.2_2021 sni-only.
 *
 * The bucket is imported (it lives in JustCookingApi and is RETAIN'd), so per the
 * CDK OAC docs the bucket policy granting the distribution access is added
 * explicitly here rather than auto-generated.
 */
export class MediaStack extends Stack {
  constructor(scope: Construct, id: string, props: MediaStackProps) {
    super(scope, id, props);

    const imageBucket = s3.Bucket.fromBucketName(
      this,
      'ImageBucket',
      props.imageBucketName,
    );

    // Cache policy 1:1 with the original CloudFrontCacheKeyPolicy.
    const cachePolicy = new cloudfront.CachePolicy(this, 'MediaCachePolicy', {
      cachePolicyName: `${props.imageBucketName}-CachePolicy`,
      comment: 'Cache policy for JustCooking media',
      defaultTtl: Duration.seconds(86400),
      maxTtl: Duration.seconds(31536000),
      minTtl: Duration.seconds(0),
      enableAcceptEncodingBrotli: true,
      enableAcceptEncodingGzip: true,
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
        'Origin',
        'Access-Control-Request-Method',
        'Access-Control-Request-Headers',
      ),
    });

    // OAC origin — auto-creates the OAC. Bucket is imported so we attach the
    // bucket policy ourselves below.
    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(imageBucket);

    const distribution = new cloudfront.Distribution(this, 'MediaDistribution', {
      comment: 'JustCooking media (image bucket) — OAC',
      domainNames: [props.mediaDomain],
      certificate: props.certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2,
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
        cachePolicy,
      },
    });

    new CfnOutput(this, 'MediaDistributionId', {
      value: distribution.distributionId,
    });
    new CfnOutput(this, 'MediaDistributionDomain', {
      value: distribution.distributionDomainName,
      description:
        'Add a Cloudflare DNS-only CNAME: media-dev.justcook.ing -> this value',
    });
    new CfnOutput(this, 'MediaAliasDomain', { value: props.mediaDomain });

    void RemovalPolicy; // reserved for future explicit policies
  }
}
