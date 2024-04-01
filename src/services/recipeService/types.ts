import { Recipe, RecipeAttributes } from '@/models/recipe';
import { LabelFromQueryResponse } from '@/store/types';
import { Document } from 'mongoose';

export type GetAllRecipesServiceResponse<T extends keyof RecipeAttributes> = {
  recipes: (Pick<Recipe, T> & Document)[];
  labels: LabelFromQueryResponse; // Assuming this type is defined elsewhere
  allLabels: LabelFromQueryResponse; // Assuming this type is defined elsewhere
};
