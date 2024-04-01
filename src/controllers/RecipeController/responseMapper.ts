import { GetAllRecipesServiceResponse } from '@/services/recipeService/types';

export const getAllRecipesResponseMapper = (
  recipes: GetAllRecipesServiceResponse<'name' | 'labels' | 'imageSrc' | 'ingredients' | 'timeToCook'>,
) => {
  return {
    recipes: recipes.recipes,
    meta: {
      availableLabels: recipes.labels?.labelCounts || [],
      totalRecipesMatching: recipes.labels?.totalRecipes ?? 0,
      allLabels: recipes.allLabels?.labelCounts || [],
      totalRecipes: recipes.allLabels?.totalRecipes ?? 0,
    },
  };
};
