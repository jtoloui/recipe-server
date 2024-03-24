import { type Logger } from 'winston';

import { type ConfigType } from '../config/config';

export interface controllerConfig {
  logger: Logger;
}
export interface controllerConfigWithStore extends controllerConfig {
  newLogger: (logLevel: string, label: string) => Logger;
  logLevel: ConfigType['logLevel'];
  awsRegion: ConfigType['awsRegion'];
  awsAccessKeyId: ConfigType['awsAccessKeyId'];
  awsSecretAccessKey: ConfigType['awsSecretAccessKey'];
  awsS3BucketName: ConfigType['awsS3BucketName'];
}

export interface configWithLogger extends controllerConfigWithStore {}

export interface configWithAWS extends configWithLogger {}

export interface storeConfig extends controllerConfig {}

interface awsConfig {
  cognitoRegion: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface authControllerConfig extends controllerConfig, awsConfig {}
