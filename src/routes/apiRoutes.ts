import { Router } from 'express';

import { ConfigType } from '../config/config';
import { recipeRoutes } from './recipeRoutes';
import { labelRoutes } from './labelRoutes';
import { measurementsRoutes } from './measurementsRoutes';
import { profileRoutes } from './profileRoutes';
import { healthRoutes } from './healthRoutes';
import { authRoutes } from './authRoutes';

export const apiRoutes = (config: ConfigType) => {
  const router = Router();

  router.use('/auth', authRoutes(config));
  router.use('/health', healthRoutes(config));
  router.use('/profile', profileRoutes(config));
  router.use('/recipes', recipeRoutes(config));
  router.use('/labels', labelRoutes(config));
  router.use('/measurements', measurementsRoutes(config));

  return router;
};
