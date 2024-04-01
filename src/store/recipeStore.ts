import mongoose, { ClientSession, Document, FilterQuery, ProjectionElementType, ProjectionType } from 'mongoose';
import { Logger } from 'winston';

import RecipeModel, { CreateRecipeData, RecipeAttributes, Recipe as RecipeType } from '@/models/recipe';
import { groupRecipesByLabelWithQuery } from '@/queries';
import { storeConfig } from '@/types/controller/controller';

import { LabelFromQueryResponse } from './types';

interface Recipe {
  getAllRecipes<T extends keyof RecipeAttributes>(
    filter?: FilterQuery<RecipeType>,
    fields?: T[]
  ): Promise<(Pick<RecipeType, T> & Document)[]>;
  getRecipeById: (id: string, projections?: ProjectionType<RecipeType> | null) => Promise<RecipeType | null>;
  createRecipe: (recipeData: CreateRecipeData, session: ClientSession) => Promise<RecipeType>;
  getLabelFromQuery: (query: FilterQuery<RecipeType>, withSearch: boolean) => Promise<LabelFromQueryResponse[]>;
}

export class RecipeStore implements Recipe {
  private store: typeof mongoose;
  private logger: Logger;

  constructor(config: storeConfig) {
    this.store = mongoose;
    this.logger = config.logger;
  }
  async getAllRecipes<T extends keyof RecipeAttributes>(
    filter: FilterQuery<RecipeType> = {},
    fields: T[] = []
  ): Promise<(Pick<RecipeType, T> & Document)[]> {
    const projection: ProjectionType<RecipeType> = {};
    for (const field of fields) {
      projection[field] = 1;
    }

    const recipes = RecipeModel.find(filter, projection);
    return await recipes;
  }

  async getRecipeById(id: string, projections: ProjectionType<RecipeType> | null = {}) {
    return await RecipeModel.findById(id, projections);
  }

  async createRecipe(recipeData: CreateRecipeData, session: ClientSession) {
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
  }

  async getLabelFromQuery(query: FilterQuery<RecipeType>, withSearch = true): Promise<LabelFromQueryResponse[]> {
    return await RecipeModel.aggregate<LabelFromQueryResponse>(groupRecipesByLabelWithQuery(query, withSearch));
  }
}
