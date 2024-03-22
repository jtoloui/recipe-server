import { Request, Response } from 'express';

import RecipeModel from '../models/recipe';
import { getMeasurementsType } from '../queries';
import { controllerConfig } from '../config/config';
import { Logger } from 'winston';

interface Measurements {
  getPopularMeasurements: (req: Request, res: Response) => Promise<Response>;
}

export class MeasurementsController implements Measurements {
  private logger: Logger;

  constructor(config: controllerConfig) {
    this.logger = config.logger;
  }

  getPopularMeasurements = async (req: Request, res: Response) => {
    try {
      const measurementsAgg = await RecipeModel.aggregate(getMeasurementsType);
      return res
        .status(200)
        .json({ measurements: measurementsAgg[0].measurements });
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - ${error}`);
      return res.status(500).json({ message: 'Error retrieving measurements' });
    }
  };
}
