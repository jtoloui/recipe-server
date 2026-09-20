import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

/**
 * Build the Bedrock Runtime client. Mirrors src/auth/awsS3.ts: when explicit
 * access keys are provided (local dev via .env) they're used; when they're
 * absent (on Lambda) we OMIT credentials so the SDK falls back to the default
 * provider chain — the Lambda execution role. No static keys in prod.
 */
export const bedrockClient = (config: {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}) => {
  const hasStaticCreds = !!config.accessKeyId && !!config.secretAccessKey;
  return new BedrockRuntimeClient({
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
