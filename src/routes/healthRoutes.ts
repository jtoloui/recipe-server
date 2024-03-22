import { Router } from 'express';

import { ConfigType } from '../config/config';
import { ServiceController } from '../controllers/serviceController';

export const healthRoutes = (config: ConfigType) => {
  const router = Router();

  const serviceController = new ServiceController({
    logger: config.newLogger(config.logLevel, 'ServiceController'),
  });

  router.get('/', serviceController.getHealth);

  return router;
};
