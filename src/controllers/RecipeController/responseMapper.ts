import { GetAllRecipesServiceResponse } from '@/services/recipeService/types';

export const getAllRecipesResponseMapper = (
  recipes: GetAllRecipesServiceResponse<'name' | 'labels' | 'imageSrc' | 'ingredients' | 'timeToCook'>,
) => {
  return {
    recipes: recipes.recipes,
    meta: {
      labels: recipes.labels.labelCounts,
      totalRecipes: recipes.labels.totalRecipes ?? 0,
    },
  };
};
