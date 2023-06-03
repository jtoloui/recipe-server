import { Request, Response, NextFunction } from 'express';
import logger from '../logger/winston';

const winstonLogger = logger('info', 'Middleware');

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.auth) {
    winstonLogger.warn(
      `[isAdmin]: Unauthorized - Request ID: ${req.id} - HTTP ${req.method} ${req.url} - Status: 401 - Unauthorized`
    );
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const roles = req.auth?.payload['http://toloui-recipe.com/roles'] as string[]; // Use the same namespace as in the Auth0 rule

  if (!roles || !roles.includes('Admin')) {
    winstonLogger.warn(
      `[isAdmin]: Forbidden - [UserId]: ${req.auth.payload.sub} - HTTP ${req.method} ${req.url} - Status: 403 - Forbidden`
    );
    return res.status(403).json({ message: 'Forbidden' });
  }

  next();
};

export const isAuthenticated = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.auth) {
    winstonLogger.warn(
      `[isAuthenticated]: Unauthorized - Request ID: ${req.id} - HTTP ${req.method} ${req.url} - Status: 401 - Unauthorized`
    );
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
};

export const attachIsAuthenticatedFunc = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  req.isAuthenticated = () => {
    return !!req.auth;
  };

  next();
};
