import { Request, Response } from 'express';
import { Logger } from 'winston';

import RecipeModel from '../models/recipe';
import { getMeasurementsType } from '../queries';
import { controllerConfig } from '../types/controller/controller';
import ResponseHandler from '../utils/responseHandler';

interface Measurements {
  getPopularMeasurements: (req: Request, res: Response) => Promise<Response>;
}

export class MeasurementsController implements Measurements {
  private logger: Logger;
  private response: ResponseHandler;

  constructor(config: controllerConfig) {
    this.logger = config.logger;
    this.response = new ResponseHandler({ logger: this.logger });
  }

  getPopularMeasurements = async (req: Request, res: Response) => {
    try {
      const measurementsAgg = await RecipeModel.aggregate(getMeasurementsType);
      const measurementsResponse = {
        measurements: measurementsAgg[0].measurements,
      };

      return this.response.sendSuccess(res, measurementsResponse);
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - Session ID: ${req.sessionID} - ${error}`);
      return this.response.sendError(res, 500, 'Error retrieving measurements');
    }
  };
}
