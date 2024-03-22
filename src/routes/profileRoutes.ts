import { Router } from 'express';

import { ConfigType } from '../config/config';
import { ProfileController } from '../controllers/profileController';
import { isAuthenticated } from '../middleware/authenticated';

export const profileRoutes = (config: ConfigType) => {
  const router = Router();

  const profileController = new ProfileController({
    logger: config.newLogger(config.logLevel, 'ProfileController'),
  });

  router.get('/', isAuthenticated, profileController.getProfile);

  return router;
};
