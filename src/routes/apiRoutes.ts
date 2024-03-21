import { Router } from 'express';

import { ProfileController } from '../controllers/profileController';
import { RecipeController } from '../controllers/recipeController';
import { ServiceController } from '../controllers/serviceController';
import { isAuthenticated } from '../middleware/authenticated';
import { ConfigType } from '../config/config';

export const apiRoutes = (config: ConfigType) => {
  const router = Router();

  // Pass the config or specific config properties to your controllers as needed
  const profileController = new ProfileController({
    logger: config.newLogger(config.logLevel, 'ProfileController'),
  });
  const recipeController = new RecipeController({
    logger: config.newLogger(config.logLevel, 'RecipeController'),
  }); // Assuming RecipeController is adjusted to accept config
  const serviceController = new ServiceController({
    logger: config.newLogger(config.logLevel, 'ServiceController'),
  }); // Assuming ServiceController is adjusted to accept config

  router.get('/health', serviceController.getHealth);

  router.get('/profile', isAuthenticated, profileController.getProfile);

  router.get('/recipes', isAuthenticated, recipeController.getAllRecipes);
  router.get('/recipes/:id', isAuthenticated, recipeController.getRecipeById);
  router.post('/recipes', isAuthenticated, recipeController.createRecipe);

  router.get(
    '/popular/measurements',
    isAuthenticated,
    recipeController.measurementsType,
  );

  router.get(
    '/popular/labels',
    isAuthenticated,
    recipeController.getPopularLabels,
  );

  router.get('/labels', isAuthenticated, recipeController.getRecipesLabels);
  router.get(
    '/labels/:label',
    isAuthenticated,
    recipeController.getRecipesByLabel,
  );

  return router; // Return the configured router
};
