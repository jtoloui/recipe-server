import { Request, Response } from 'express';
import { Logger } from 'winston';

import { CreateRecipeFormDataRequest } from '@/schemas/index';
import { RecipeService } from '@/services/recipeService/recipeService';
import { controllerConfigWithStore } from '@/types/controller/controller';
import { ServiceError } from '@/utils/errors';
import ResponseHandler from '@/utils/responseHandler';
import { getAllRecipesResponseMapper } from './responseMapper';

interface Recipe {
  getAllRecipes: (req: Request, res: Response) => Promise<Response>;
  getRecipeById: (req: Request, res: Response) => Promise<Response>;
  createRecipe: (req: Request<any, any, CreateRecipeFormDataRequest>, res: Response) => Promise<Response>;
}

type RecipeQuery = {
  search?: string;
  label?: string;
};

export class RecipeController implements Recipe {
  private logger: Logger;
  private service: RecipeService;
  private response: ResponseHandler;

  constructor(config: controllerConfigWithStore) {
    this.logger = config.logger;
    this.response = new ResponseHandler({ logger: this.logger });
    this.service = new RecipeService({
      logger: config.newLogger(config.logLevel, 'RecipeService'),
      newLogger: config.newLogger,
      logLevel: config.logLevel,
      awsRegion: config.awsRegion,
      awsS3BucketName: config.awsS3BucketName,
      awsAccessKeyId: config.awsAccessKeyId,
      awsSecretAccessKey: config.awsSecretAccessKey,
    });
  }

  getAllRecipes = async (req: Request<any, any, any, RecipeQuery>, res: Response) => {
    try {
      const recipes = await this.service.getAllRecipes(req.query.search, req.query.label);

      return this.response.sendSuccess(res, getAllRecipesResponseMapper(recipes));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error retrieving recipes';
      this.logger.error(`Request ID: ${req.id} - Session ID: ${req.sessionID} - ${error}`);
      return this.response.sendError(res, 500, errorMessage);
    }
  };

  getRecipeById = async (req: Request, res: Response) => {
    try {
      this.logger.info(
        `UserId: ${req.session.user?.sub} - Request ID: ${req.id} - Session ID: ${req.sessionID} - Recipe ID: ${req.params.id}\n %j\n`,
        {
          userId: req.session.user?.sub,
          recipeId: req.params.id,
          gello: 1,
        },
      );

      const recipe = await this.service.getRecipeById(req.params.id);

      if (!recipe) {
        return this.response.sendError(res, 404, 'Recipe not found');
      }

      const isAuthor = recipe.creatorId === req.session?.user?.sub;
      return this.response.sendSuccess(res, {
        ...recipe.toObject(),
        isAuthor,
      });
    } catch (error) {
      if (error instanceof ServiceError) {
        return this.response.sendError(res, error.cause.status, error.message);
      }

      const errorMessage = error instanceof Error ? error.message : 'Error retrieving recipes';
      this.logger.error(`Request ID: ${req.id} - Session ID: ${req.sessionID} - ${error}`);
      return this.response.sendError(res, 500, errorMessage);
    }
  };

  createRecipe = async (req: Request<any, any, CreateRecipeFormDataRequest>, res: Response) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      this.logger.debug(
        `UserId: ${req.session.user.sub} - Request ID: ${req.id} - Session ID: ${req.sessionID} - Create Recipe`,
        req.body,
      );

      const newRecipe = await this.service.createRecipe(req, req.session.user);

      return res.status(201).json(newRecipe);
    } catch (error) {
      if (error instanceof ServiceError) {
        this.logger.debug(`Invalid request payload: ${error.cause.message}`);
        return res.status(error.cause.status).json({ message: error.message });
      }
      this.logger.debug(`Error creating recipe: ${error}`);
      return res.status(500).json({ message: 'Error creating recipe' });
    }
  };
}
