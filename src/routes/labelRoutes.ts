import { Router } from 'express';
import { LabelController } from '../controllers/labelController';
import { isAuthenticated } from '../middleware/authenticated';
import { ConfigType } from '../config/config';

export const labelRoutes = (config: ConfigType) => {
  const router = Router();

  const labelController = new LabelController({
    logger: config.newLogger(config.logLevel, 'LabelController'),
  });

  router.get('/', isAuthenticated, labelController.getLabels);
  router.get('/popular', isAuthenticated, labelController.getPopularLabels);
  router.get('/:label', isAuthenticated, labelController.getByLabel);

  return router;
};
