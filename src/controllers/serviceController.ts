import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { Logger } from 'winston';

import { controllerConfig } from '../types/controller/controller';
import ResponseHandler from '../utils/responseHandler';

interface Service {
  getHealth: (req: Request, res: Response) => Promise<Response>;
}

type BuildInfo = {
  buildTime: string;
  commitHash: string;
  buildVersion: string;
};
export class ServiceController implements Service {
  private logger: Logger;
  private response: ResponseHandler;

  constructor(config: controllerConfig) {
    this.logger = config.logger;
    this.response = new ResponseHandler({ logger: this.logger });
  }

  getHealth = async (req: Request, res: Response) => {
    try {
      const projectRoot = path.resolve(__dirname, '../../');
      const buildInfoString = fs.readFileSync(path.resolve(projectRoot, 'build-info.json'), 'utf8');

      const buildInfo: BuildInfo = JSON.parse(buildInfoString);

      return this.response.sendSuccess(res, buildInfo);
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - ${error}`);
      return this.response.sendError(res, 500, 'Error retrieving health');
    }
  };
}
