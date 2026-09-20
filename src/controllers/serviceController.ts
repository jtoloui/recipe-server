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

  private readBuildInfo(): BuildInfo | null {
    // build-info.json is written next to the compiled output (dist/). Try a
    // couple of known locations and tolerate absence — a health check must not
    // fail just because build metadata isn't packaged.
    const candidates = [
      path.resolve(__dirname, '../../build-info.json'), // dist/build-info.json (prebuild.js)
      path.resolve(__dirname, '../../out/build-info.json'), // legacy location
      path.resolve(process.cwd(), 'dist/build-info.json'),
    ];
    for (const p of candidates) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf8')) as BuildInfo;
      } catch {
        // try next
      }
    }
    return null;
  }

  getHealth = async (req: Request, res: Response) => {
    const buildInfo = this.readBuildInfo();
    return this.response.sendSuccess(res, {
      status: 'ok',
      ...(buildInfo ?? {}),
    });
  };
}
