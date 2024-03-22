import { Router } from 'express';

import { ConfigType } from '../config/config';
import { MeasurementsController } from '../controllers/measurementsController';
import { isAuthenticated } from '../middleware/authenticated';

export const measurementsRoutes = (config: ConfigType) => {
  const router = Router();

  const measurementsController = new MeasurementsController({
    logger: config.newLogger(config.logLevel, 'MeasurementsController'),
  });

  router.get(
    '/popular',
    isAuthenticated,
    measurementsController.getPopularMeasurements
  );

  return router;
};
