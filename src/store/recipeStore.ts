import mongoose, { ProjectionType } from 'mongoose';
import { Logger } from 'winston';

import RecipeModel, { CreateRecipeData, Recipe as RecipeType } from '@/models/recipe';
import { storeConfig } from '@/types/controller/controller';

interface Recipe {
  getAllRecipes: () => Promise<RecipeType[]>;
  getRecipeById: (id: string, projections?: ProjectionType<RecipeType> | null) => Promise<RecipeType | null>;
  createRecipe: (recipeData: CreateRecipeData) => Promise<RecipeType>;
}

export class RecipeStore implements Recipe {
  private store: typeof mongoose;
  private logger: Logger;

  constructor(config: storeConfig) {
    this.store = mongoose;
    this.logger = config.logger;
  }
  getAllRecipes = async (): Promise<RecipeType[]> => {
    return await RecipeModel.find({}, {});
  };

  getRecipeById = async (id: string, projections: ProjectionType<RecipeType> | null = {}) => {
    return await RecipeModel.findById(id, projections);
  };

  createRecipe = async (recipeData: CreateRecipeData) => {
    const session = await this.store.startSession();
    try {
      this.logger.debug('Creating recipe');
      session.startTransaction();

      const newRecipe = await RecipeModel.create(recipeData);

      await newRecipe.validate();
      await newRecipe.save({ session });

      await session.commitTransaction();

      return newRecipe;
    } catch (error) {
      await session.abortTransaction();
      this.logger.error(`Error creating recipe: ${error}`);
      throw error;
    } finally {
      session.endSession();
    }
  };
}
