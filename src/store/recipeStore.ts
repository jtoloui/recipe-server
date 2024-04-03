import mongoose, { ClientSession, Document, FilterQuery, ProjectionElementType, ProjectionType } from 'mongoose';
import { Logger } from 'winston';

import RecipeModel, { CreateRecipeData, RecipeAttributes, Recipe as RecipeType } from '@/models/recipe';
import { groupRecipesByLabelWithQuery } from '@/queries';
import { storeConfig } from '@/types/controller/controller';

import { LabelFromQueryResponse } from './types';

interface Recipe {
  getAllRecipes<T extends keyof RecipeAttributes>(
    filter?: FilterQuery<RecipeType>,
    fields?: T[],
  ): Promise<(Pick<RecipeType, T> & Document)[]>;
  getRecipeById: (
    id: string,
    projections?: ProjectionType<RecipeType> | null,
    session?: ClientSession,
  ) => Promise<RecipeType | null>;
  createRecipe: (recipeData: CreateRecipeData, session: ClientSession) => Promise<RecipeType>;
  getLabelFromQuery: (query: FilterQuery<RecipeType>, withSearch: boolean) => Promise<LabelFromQueryResponse[]>;
  updateRecipe: (recipe: RecipeType, updateData: CreateRecipeData, session: ClientSession) => Promise<RecipeType>;
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
    fields: T[] = [],
  ): Promise<(Pick<RecipeType, T> & Document)[]> {
    const projection: ProjectionType<RecipeType> = {};
    for (const field of fields) {
      projection[field] = 1;
    }

    const recipes = RecipeModel.find(filter, projection);
    return await recipes;
  }

  async getRecipeById(id: string, projections: ProjectionType<RecipeType> | null = {}, session?: ClientSession) {
    const recipe = RecipeModel.findById(id, projections);
    if (session) {
      recipe.session(session);
    }
    return await recipe;
  }

  async createRecipe(recipeData: CreateRecipeData, session: ClientSession) {
    try {
      this.logger.debug('Creating recipe');

      const newRecipe = RecipeModel.build(recipeData);
      const imageName = `${newRecipe.id}-${newRecipe.image.originalName.toLocaleLowerCase().replace(/ /g, '_')}`;
      newRecipe.image.storageName = imageName;
      newRecipe.image.src = `${process.env.MEDIA_URI}/images/${imageName}`;
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

  async updateRecipe(recipe: RecipeType, updateData: CreateRecipeData, session: ClientSession) {
    try {
      this.logger.debug(`Updating recipe with id: ${recipe.id}`);
      const recordData = updateData;
      const imageName = `${recipe.id}-${updateData.image.originalName.toLocaleLowerCase().replace(/ /g, '_')}`;
      recordData.image.storageName = imageName;
      recordData.image.src = `${process.env.MEDIA_URI}/images/${imageName}`;

      const updatedRecipe = recipe;
      recipe.set(recordData).$session(session);

      await updatedRecipe.validate();

      await updatedRecipe.save({ session });

      return updatedRecipe;
    } catch (error) {
      this.logger.error(`Error updating recipe: ${error}`);
      throw error;
    }
  }
}
