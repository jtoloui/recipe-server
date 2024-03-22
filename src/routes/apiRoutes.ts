import { Router } from 'express';

import { ConfigType } from '../config/config';
import { authRoutes } from './authRoutes';
import { healthRoutes } from './healthRoutes';
import { labelRoutes } from './labelRoutes';
import { measurementsRoutes } from './measurementsRoutes';
import { profileRoutes } from './profileRoutes';
import { recipeRoutes } from './recipeRoutes';

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
