import { Request, Response, NextFunction } from 'express';
import logger from '../logger/winston';

const winstonLogger = logger('info', 'Middleware');

export const isAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const isAuthenticated = await req.oidc.isAuthenticated();
    if (!isAuthenticated) {
      throw new Error('User is not authenticated');
    }
    const roles = await req.oidc.user?.['http://toloui-recipe.com/roles'];

    if (!roles || !roles.includes('Admin')) {
      throw new Error('User is not an admin');
    }

    next();
  } catch (error) {
    const err = error as Error;
    winstonLogger.error(
      `[isAdmin]: Forbidden - [UserId]: ${req.oidc.user?.sub} - Request ID: ${req.id} - HTTP ${req.method} ${req.url} - Status: 403 - Forbidden - Reason: ${err.message}`
    );
    return res.status(403).json({ message: 'Forbidden' });
  }
};

export const isAuthenticated = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const isAuthenticated = await req.oidc.isAuthenticated();

    if (!isAuthenticated) {
      throw new Error('User is not authenticated');
    }

    next();
  } catch (error) {
    const err = error as Error;

    winstonLogger.error(
      `[isAuthenticated]: Unauthorized - [UserId]: N/A - Request ID: ${req.id} - HTTP ${req.method} ${req.url} - Status: 401 - Unauthorized - Reason: ${err.message}`
    );

    return res.status(401).json({ message: 'Unauthorized' });
  }
};
