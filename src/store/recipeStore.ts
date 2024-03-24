import mongoose, { ClientSession, ProjectionType } from 'mongoose';
import { Logger } from 'winston';

import RecipeModel, { CreateRecipeData, Recipe as RecipeType } from '@/models/recipe';
import { storeConfig } from '@/types/controller/controller';

interface Recipe {
  getAllRecipes: () => Promise<RecipeType[]>;
  getRecipeById: (id: string, projections?: ProjectionType<RecipeType> | null) => Promise<RecipeType | null>;
  createRecipe: (recipeData: CreateRecipeData, session: ClientSession) => Promise<RecipeType>;
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

  createRecipe = async (recipeData: CreateRecipeData, session: ClientSession) => {
    try {
      this.logger.debug('Creating recipe');

      const newRecipe = RecipeModel.build(recipeData);
      newRecipe.imageSrc = `${process.env.AWS_CLOUDFRONT_DOMAIN}/${newRecipe.id}`;
      await newRecipe.validate();
      await newRecipe.save({ session });

      return newRecipe;
    } catch (error) {
      this.logger.error(`Error creating recipe: ${error}`);
      throw error;
    }
  };
}
