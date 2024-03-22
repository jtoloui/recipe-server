import { Router } from 'express';

import { ProfileController } from '../controllers/profileController';
import { isAuthenticated } from '../middleware/authenticated';
import { ConfigType } from '../types/config/config';

export const profileRoutes = (config: ConfigType) => {
  const router = Router();

  const profileController = new ProfileController({
    logger: config.newLogger(config.logLevel, 'ProfileController'),
  });

  router.get('/', isAuthenticated, profileController.getProfile);

  return router;
};
