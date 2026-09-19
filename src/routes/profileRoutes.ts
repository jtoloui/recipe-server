import { Router } from 'express';

import { ProfileController } from '../controllers/profileController';
import { isAuthenticated } from '../middleware/authenticated';
import { ConfigType } from '../types/config/config';

export const profileRoutes = (config: ConfigType) => {
  const router = Router();

  const profileController = new ProfileController({
    logger: config.newLogger(config.logLevel, 'ProfileController'),
    cognitoRegion: config.awsRegion,
    accessKeyId: config.awsAccessKeyId,
    secretAccessKey: config.awsSecretAccessKey,
  });

  router.get('/', isAuthenticated, profileController.getProfile);
  router.put('/', isAuthenticated, profileController.updateProfile);

  return router;
};
