import { S3Client } from '@aws-sdk/client-s3';

/**
 * Build the S3 client. When explicit access keys are provided (local dev via
 * .env) they're used; when they're absent (on Lambda) we OMIT credentials so
 * the SDK falls back to the default provider chain — i.e. the Lambda execution
 * role. This lets prod run with an IAM role instead of static keys (no
 * S3_ACCESS_KEY_ID/SECRET in SSM).
 */
export const s3Client = (config: {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}) => {
  const hasStaticCreds = !!config.accessKeyId && !!config.secretAccessKey;
  return new S3Client({
    region: config.region,
    ...(hasStaticCreds
      ? {
          credentials: {
            accessKeyId: config.accessKeyId as string,
            secretAccessKey: config.secretAccessKey as string,
          },
        }
      : {}),
  });
};
