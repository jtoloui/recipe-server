import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

import logger from '../logger/winston';

export class ServiceController {
  private logger: ReturnType<typeof logger>;

  constructor() {
    const logLevel = process.env.LOG_LEVEL || 'info';
    this.logger = logger(logLevel, 'ServiceController');
  }

  getHealth = async (req: Request, res: Response) => {
    try {
      const projectRoot = path.resolve(__dirname, '..');
      console.log(projectRoot);
      const buildInfo = JSON.parse(fs.readFileSync('build-info.json', 'utf8'));
      return res.status(200).json(buildInfo);
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - ${error}`);
      return res.status(500).json({ message: 'Error retrieving health' });
    }
  };
}
