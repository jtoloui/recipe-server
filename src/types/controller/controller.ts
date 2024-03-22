import { type Logger } from 'winston';

import { type ConfigType } from '../config/config';

export interface controllerConfig {
  logger: Logger;
}
export interface controllerConfigWithStore extends controllerConfig {
  newLogger: (logLevel: string, label: string) => Logger;
  logLevel: ConfigType['logLevel'];
}

export interface storeConfig extends controllerConfig {}

interface awsConfig {
  cognitoRegion: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface authControllerConfig extends controllerConfig, awsConfig {}