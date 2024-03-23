import { RecipeStore } from '@/store/recipeStore';
import { configWithLogger } from '@/types/controller/controller';
import { Logger } from 'winston';
import { RecipeByIdErrors, RecipeServiceErrors } from './errors';
import { RecipeAttributes, Recipe as RecipeType } from '@/models/recipe';
import { CreateRecipeFormData, convertRecipeZodToMongo, createRecipeSchema } from '@/schemas/index';
import { User } from '@/types/common/user';
import { Request } from 'express';

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
      throw RecipeServiceErrors;
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
      this.logger.error(`Error retrieving recipe: ${error}`);
      throw RecipeByIdErrors;
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
      throw error;
    }
  }
}
