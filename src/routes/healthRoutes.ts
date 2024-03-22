import { Router } from 'express';

import { ServiceController } from '../controllers/serviceController';
import { ConfigType } from '../types/config/config';

export const healthRoutes = (config: ConfigType) => {
  const router = Router();

  const serviceController = new ServiceController({
    logger: config.newLogger(config.logLevel, 'ServiceController'),
  });

  router.get('/', serviceController.getHealth);

  return router;
};
