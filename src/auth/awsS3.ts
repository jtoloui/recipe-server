import { S3Client } from '@aws-sdk/client-s3';

export const s3Client = (config: { region: string; accessKeyId: string; secretAccessKey: string }) => {
  return new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
};
