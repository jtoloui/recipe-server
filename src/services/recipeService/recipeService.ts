import { Request } from 'express';
import { MongooseError } from 'mongoose';
import { Logger } from 'winston';
import { z } from 'zod';

import { RecipeAttributes, Recipe as RecipeType } from '@/models/recipe';
import { CreateRecipeFormData, convertRecipeZodToMongo, createRecipeSchema } from '@/schemas/index';
import { RecipeStore } from '@/store/recipeStore';
import { User } from '@/types/common/user';
import { configWithLogger } from '@/types/controller/controller';
import { ServiceError } from '@/utils/errors';

import {
  RecipeByIdErrors,
  RecipeCreateErrors,
  RecipeCreateValidationErrors,
  RecipeIdInvalidFormat,
  RecipeServiceErrors,
} from './errors';

interface Recipe {
  getAllRecipes: () => Promise<RecipeType[]>;
  getRecipeById: (id: string) => Promise<RecipeType | null>;
  createRecipe: (payload: Request<null, null, CreateRecipeFormData>, user: User) => Promise<RecipeType>;
}

export class RecipeService implements Recipe {
  private store: RecipeStore;
  private logger: Logger;

  constructor(config: configWithLogger) {
    this.store = new RecipeStore({ logger: config.newLogger(config.logLevel, 'RecipeStore') });
    this.logger = config.newLogger(config.logLevel, 'RecipeService');
  }

  async getAllRecipes(): Promise<RecipeType[]> {
    try {
      return await this.store.getAllRecipes();
    } catch (error) {
      this.logger.error(`Error retrieving recipes: ${error}`);
      throw new ServiceError(RecipeServiceErrors, {
        status: 500,
        message: 'Error retrieving recipes',
      });
    }
  }

  async getRecipeById(id: string): Promise<RecipeType | null> {
    try {
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
      return await this.store.getRecipeById(id, findReturnItems);
    } catch (error) {
      if (error instanceof MongooseError && error.name === 'CastError') {
        this.logger.debug(`Invalid recipe ID: ${id}`);
        throw new ServiceError(RecipeIdInvalidFormat, {
          status: 400,
          message: 'Invalid recipe ID',
        });
      }
      this.logger.error(`Error retrieving recipe: ${error}`);
      throw new ServiceError(RecipeByIdErrors, {
        status: 500,
        message: 'Error retrieving recipe',
      });
    }
  }

  async createRecipe(payload: Request<null, null, CreateRecipeFormData>, user: User): Promise<RecipeType> {
    try {
      const validatedReqData = await createRecipeSchema.parseAsync(payload.body);
      const newRecipeData = convertRecipeZodToMongo(validatedReqData);

      const { labels } = newRecipeData;
      const capitalizedLabels = labels.map((label) => label.charAt(0).toUpperCase() + label.slice(1));

      return await this.store.createRecipe({
        ...newRecipeData,
        labels: capitalizedLabels,
        creatorId: user.sub,
        recipeAuthor: user.name,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        this.logger.debug(`Invalid request payload: ${error.errors}`);
        throw new ServiceError(RecipeCreateValidationErrors, {
          status: 400,
          message: 'Payload did not match schema',
        });
      }

      const errorMessage = error instanceof Error ? error.message : 'Error creating recipe';

      this.logger.debug(`Error creating recipe: ${errorMessage}`);
      throw new ServiceError(RecipeCreateErrors, {
        status: 500,
        message: errorMessage,
      });
    }
  }
}
