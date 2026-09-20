import { Router } from 'express';

import { ConfigType } from '@/types/config/config';

import { authRoutes } from './authRoutes';
import { healthRoutes } from './healthRoutes';
import { labelRoutes } from './labelRoutes';
import { measurementsRoutes } from './measurementsRoutes';
import { nutritionRoutes } from './nutritionRoutes';
import { profileRoutes } from './profileRoutes';
import { recipeRoutes } from './recipeRoutes';

export const apiRoutes = (config: ConfigType) => {
  const router = Router();

  router.use('/auth', authRoutes(config));
  router.use('/health', healthRoutes(config));
  router.use('/profile', profileRoutes(config));
  // Mount the specific /recipes/nutrition sub-path BEFORE /recipes so it is
  // matched ahead of the GET /recipes/:id route.
  router.use('/recipes/nutrition', nutritionRoutes(config));
  router.use('/recipes', recipeRoutes(config));
  router.use('/labels', labelRoutes(config));
  router.use('/measurements', measurementsRoutes(config));

  return router;
};
