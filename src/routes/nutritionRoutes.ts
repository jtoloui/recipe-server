import { Router } from 'express';

import { NutritionController } from '@/controllers/nutritionController';
import { isAuthenticated } from '@/middleware/authenticated';
import { ConfigType } from '@/types/config/config';

/**
 * Nutrition estimation routes, mounted UNDER /recipes so the public path is
 * POST /api/recipes/nutrition. Stateless: takes an ingredient list + servings
 * in the body (used by the create/edit form before a recipe id exists), so it
 * does not collide with GET /recipes/:id (different verb + this router is
 * mounted at /recipes/nutrition).
 */
export const nutritionRoutes = (config: ConfigType) => {
  const router = Router();
  const controller = new NutritionController({
    logger: config.newLogger(config.logLevel, 'NutritionController'),
    region: config.awsRegion,
    accessKeyId: config.awsAccessKeyId,
    secretAccessKey: config.awsSecretAccessKey,
  });

  router.post('/', isAuthenticated, controller.estimate);

  return router;
};
