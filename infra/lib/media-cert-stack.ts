import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface MediaCertStackProps extends StackProps {
  /** Domains to certify, e.g. [media-dev.justcook.ing, idp-dev.justcook.ing]. */
  readonly domainNames: string[];
}

/**
 * ACM certificate stack, pinned to us-east-1 (required for CloudFront viewer
 * certs and Cognito custom domains). DNS is in Cloudflare, so validation is NOT
 * automated — CDK emits the certificate in PENDING_VALIDATION and the CNAME
 * records to add are read from the ACM console / describe-certificate.
 *
 * A single cert covers both the media alias and the Cognito custom domain.
 */
export class MediaCertStack extends Stack {
  public readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: MediaCertStackProps) {
    super(scope, id, props);

    const [primary, ...alts] = props.domainNames;
    this.certificate = new acm.Certificate(this, 'Cert', {
      domainName: primary,
      subjectAlternativeNames: alts.length ? alts : undefined,
      // Cloudflare DNS: manual CNAME validation (records output post-deploy).
      validation: acm.CertificateValidation.fromDns(),
    });

    new CfnOutput(this, 'CertificateArn', { value: this.certificate.certificateArn });
    new CfnOutput(this, 'CertDomains', { value: props.domainNames.join(', ') });
  }
}
