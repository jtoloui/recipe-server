import { Request, Response } from 'express';
import { Logger } from 'winston';

import {
  NutritionService,
  NutritionServiceError,
  NutritionEstimateInput,
} from '../services/nutritionService/nutritionService';
import ResponseHandler from '../utils/responseHandler';

export interface NutritionControllerConfig {
  logger: Logger;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

interface NutritionApi {
  estimate: (req: Request, res: Response) => Promise<Response>;
}

export class NutritionController implements NutritionApi {
  private logger: Logger;
  private response: ResponseHandler;
  private service: NutritionService;

  constructor(config: NutritionControllerConfig) {
    this.logger = config.logger;
    this.response = new ResponseHandler({ logger: this.logger });
    this.service = new NutritionService({
      logger: this.logger,
      region: config.region,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    });
  }

  estimate = async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Partial<NutritionEstimateInput>;
    const servings = Number(body.servings);
    const ingredients = Array.isArray(body.ingredients) ? body.ingredients : [];

    if (!Number.isFinite(servings) || servings <= 0) {
      return this.response.sendError(res, 400, 'A positive servings value is required');
    }
    if (ingredients.length === 0) {
      return this.response.sendError(res, 400, 'At least one ingredient is required');
    }

    try {
      const estimate = await this.service.estimate({
        name: body.name,
        servings,
        ingredients,
      });
      return this.response.sendSuccess(res, estimate);
    } catch (error) {
      if (error instanceof NutritionServiceError) {
        return this.response.sendError(res, error.statusCode, error.message);
      }
      this.logger.error(
        `Request ID: ${req.id} - Session ID: ${req.sessionID} - nutrition estimate error: ${error}`,
      );
      return this.response.sendError(res, 500, 'Error estimating nutrition');
    }
  };
}
