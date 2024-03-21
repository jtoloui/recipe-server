import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

import { controllerConfig } from '../config/config';
import { Logger } from 'winston';

interface Service {
  getHealth: (req: Request, res: Response) => Promise<Response>;
}

export class ServiceController implements Service {
  private logger: Logger;

  constructor(config: controllerConfig) {
    this.logger = config.logger;
  }

  getHealth = async (req: Request, res: Response) => {
    try {
      const projectRoot = path.resolve(__dirname, '../../');
      const buildInfo = fs.readFileSync(
        path.resolve(projectRoot, 'build-info.json'),
        'utf8',
      );
      return res.status(200).json(JSON.parse(buildInfo));
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - ${error}`);
      return res.status(500).json({ message: 'Error retrieving health' });
    }
  };
}
