import { Router } from 'express';

import { RecipeController } from '@/controllers/recipeController';
import { isAuthenticated } from '@/middleware/authenticated';
import { ConfigType } from '@/types/config/config';

export const recipeRoutes = (config: ConfigType) => {
  const router = Router();
  const recipeController = new RecipeController({
    logger: config.newLogger(config.logLevel, 'RecipeController'),
    newLogger: config.newLogger,
    logLevel: config.logLevel,
  });
  router.get('/', isAuthenticated, recipeController.getAllRecipes);
  router.get('/:id', isAuthenticated, recipeController.getRecipeById);
  router.post('/', isAuthenticated, recipeController.createRecipe);

  return router;
};
