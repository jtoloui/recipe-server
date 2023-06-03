import { Request, Response, NextFunction } from 'express';
import logger from '../logger/winston';
import { authenticationClient } from '../auth/auth0Client';

const winstonLogger = logger('info', 'Middleware');

export const isAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const jwt = req.cookies.jwt;

    req.auth = await authenticationClient.getProfile(jwt);

    // req.auth.
  } catch (error) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  if (!req.auth) {
    winstonLogger.warn(
      `[isAdmin]: Unauthorized - Request ID: ${req.id} - HTTP ${req.method} ${req.url} - Status: 401 - Unauthorized`
    );
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const roles = req.auth?.payload['http://toloui-recipe.com/roles'] as string[]; // Use the same namespace as in the Auth0 rule

  if (!roles || !roles.includes('Admin')) {
    winstonLogger.warn(
      `[isAdmin]: Forbidden - [UserId]: ${req.auth.sub} - HTTP ${req.method} ${req.url} - Status: 403 - Forbidden`
    );
    return res.status(403).json({ message: 'Forbidden' });
  }

  next();
};

export const isAuthenticated = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const jwt = req.cookies.jwt;
    // console.log(jwt);

    // const profile = await authenticationClient.getProfile(jwt);
    // console.log(profile);

    next();
  } catch (error) {
    console.log(error);

    winstonLogger.error(
      `[isAuthenticated]: Unauthorized - Request ID: ${req.id} - HTTP ${req.method} ${req.url} - Status: 401 - Unauthorized`
    );
    return res.status(401).json({ message: 'Unauthorized' });
  }
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
