import { Recipe } from '@/models/recipe';
import { LabelFromQueryResponse } from '@/store/types';

export type GetAllRecipesResponse = {
  recipes: Recipe[];
  meta: {
    labels: LabelFromQueryResponse['labelCounts'];
    totalRecipes: LabelFromQueryResponse['totalRecipes'];
  };
};
