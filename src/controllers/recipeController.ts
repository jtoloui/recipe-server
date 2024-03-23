import { Request, Response } from 'express';
import { Logger } from 'winston';
import { z } from 'zod';

import { RecipeAttributes } from '@/models/recipe';
import { CreateRecipeFormData, convertRecipeZodToMongo, createRecipeSchema } from '@/schemas/index';
import { controllerConfigWithStore } from '@/types/controller/controller';
import ResponseHandler from '@/utils/responseHandler';

import { RecipeService } from '@/services/recipeService/recipeService';

interface Recipe {
  getAllRecipes: (req: Request, res: Response) => Promise<Response>;
  getRecipeById: (req: Request, res: Response) => Promise<Response>;
  createRecipe: (req: Request<any, any, CreateRecipeFormData>, res: Response) => Promise<Response>;
}
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
    });
  }

  getAllRecipes = async (req: Request, res: Response) => {
    try {
      const recipes = await this.service.getAllRecipes();

      // TODO: add custom response mapper
      return this.response.sendSuccess(res, recipes);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error retrieving recipes';
      this.logger.error(`Request ID: ${req.id} - Session ID: ${req.sessionID} - ${error}`);
      return this.response.sendError(res, 500, errorMessage);
    }
  };

  getRecipeById = async (req: Request, res: Response) => {
    try {
      this.logger.debug(
        `UserId: ${req.session.user?.sub} - Request ID: ${req.id} - Session ID: ${req.sessionID} - Recipe ID: ${req.params.id} `,
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
      const errorMessage = error instanceof Error ? error.message : 'Error retrieving recipes';
      this.logger.error(`Request ID: ${req.id} - Session ID: ${req.sessionID} - ${error}`);
      return this.response.sendError(res, 500, errorMessage);
    }
  };

  createRecipe = async (req: Request<any, any, CreateRecipeFormData>, res: Response) => {
    try {
      if (!req.session?.user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      this.logger.debug(
        `UserId: ${req.session.user.sub} - Request ID: ${req.id} - Session ID: ${req.sessionID} - Create Recipe`,
        req.body,
      );
      // const validatedReqData = await createRecipeSchema.parseAsync(req.body);
      // const newRecipeData = convertRecipeZodToMongo(validatedReqData);
      // const { labels } = newRecipeData;
      // const capitalizedLabels = labels.map((label) => label.charAt(0).toUpperCase() + label.slice(1));

      // const newRecipe = await this.store.createRecipe({
      //   ...newRecipeData,
      //   creatorId: req.session.user.sub,
      //   recipeAuthor: req.session.user.name,
      //   labels: capitalizedLabels,
      // });

      const newRecipe = await this.service.createRecipe(req, req.session.user);

      return res.status(201).json(newRecipe);
    } catch (error) {
      res.set('Content-Type', 'application/json');

      if (error instanceof z.ZodError) {
        console.log(error.errors);
        this.logger.error(`Request ID: ${req.id} - Session ID: ${req.sessionID} - ${error.errors}`);
        return this.response.sendError(res, 400, 'Invalid request data');
      }
      this.logger.error(`Request ID: ${req.id} - Session ID: ${req.sessionID} - ${error}`);
      return this.response.sendError(res, 500, 'Error creating recipe');
    }
  };
}
