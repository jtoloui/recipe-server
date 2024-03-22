import { Request, Response } from 'express';
import { Logger } from 'winston';
import { z } from 'zod';

import { controllerConfigWithStore } from '../config/config';
import { RecipeAttributes } from '../models/recipe';
import { convertRecipeZodToMongo, createRecipeSchema } from '../schemas';
import { RecipeStore } from '../store/recipeStore';

interface Recipe {
  getAllRecipes: (req: Request, res: Response) => Promise<Response>;
  getRecipeById: (req: Request, res: Response) => Promise<Response>;
  createRecipe: (req: Request, res: Response) => Promise<Response>;
}
export class RecipeController implements Recipe {
  private logger: Logger;
  private store: RecipeStore;

  constructor(config: controllerConfigWithStore) {
    this.logger = config.logger;
    this.store = new RecipeStore({
      logger: config.newLogger(config.logLevel, 'RecipeStore'),
    });
  }

  getAllRecipes = async (req: Request, res: Response) => {
    try {
      const recipes = await this.store.getAllRecipes();
      this.logger.debug(`Request ID: ${req.id} - ${recipes}`);
      return res.status(200).json(recipes);
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - ${error}`);
      return res.status(500).json({ message: 'Error retrieving recipes' });
    }
  };

  getRecipeById = async (req: Request, res: Response) => {
    try {
      this.logger.debug(
        `UserId: ${req.session.user?.sub} - Request ID: ${req.id} - Recipe ID: ${req.params.id} `
      );
      const findReturnItems: {
        [K in keyof Partial<RecipeAttributes>]: number;
      } = {
        name: 1,
        labels: 1,
        imageSrc: 1,
        ingredients: 1,
        timeToCook: 1,
        steps: 1,
        vegan: 1,
        vegetarian: 1,
        creatorId: 1,
        recipeAuthor: 1,
        difficulty: 1,
        portions: 1,
        description: 1,
        nutrition: 1,
        cuisine: 1,
      };
      const recipe = await this.store.getRecipeById(
        req.params.id,
        findReturnItems
      );

      if (recipe) {
        const isAuthor = recipe.creatorId === req.session?.user?.sub;
        return res.status(200).json({ ...recipe.toObject(), isAuthor });
      } else {
        return res.status(404).json({ message: 'Recipe not found' });
      }
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - ${error}`);
      return res.status(500).json({ message: 'Error retrieving recipe' });
    }
  };

  createRecipe = async (req: Request, res: Response) => {
    try {
      if (!req.session?.user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      this.logger.debug(
        `UserId: ${req.session.user.sub} - Request ID: ${req.id} - Create Recipe`,
        req.body
      );
      const validatedReqData = await createRecipeSchema.parseAsync(req.body);
      const newRecipeData = convertRecipeZodToMongo(validatedReqData);
      const { labels } = newRecipeData;
      const capitalizedLabels = labels.map(
        (label) => label.charAt(0).toUpperCase() + label.slice(1)
      );

      const newRecipe = await this.store.createRecipe({
        ...newRecipeData,
        creatorId: req.session.user.sub,
        recipeAuthor: req.session.user.name,
        labels: capitalizedLabels,
      });

      return res.status(201).json(newRecipe);
    } catch (error) {
      if (error instanceof z.ZodError) {
        this.logger.error(`Request ID: ${req.id} - ${error.errors}`);
        return res.status(400).json({ message: 'Invalid request data', error });
      }
      this.logger.error(`Request ID: ${req.id} - ${error}`);
      return res.status(500).json({ message: 'Error creating recipe' });
    }
  };
}
