import { Router } from 'express';

import { MeasurementsController } from '../controllers/measurementsController';
import { isAuthenticated } from '../middleware/authenticated';
import { ConfigType } from '../types/config/config';

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
