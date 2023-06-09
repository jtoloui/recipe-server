import { CognitoIdentityProvider } from '@aws-sdk/client-cognito-identity-provider';
import { NextFunction, Request, Response } from 'express';

import { poolData } from '../auth/awsCognito';
import logger from '../logger/winston';

const winstonLogger = logger('info', 'Authentication Middleware');

export const isAuthenticated = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const sessionToken = req.session?.user?.tokens?.IdToken;
  const cookieToken = req.cookies?.app_session;
  const userName = req.session?.user?.username;

  if (!sessionToken || !userName || !cookieToken) {
    winstonLogger.error(`[isAuthenticated]: Forbidden - No token provided`);
    return res.status(401).json({ message: 'Forbidden: No token provided' });
  }

  const client = new CognitoIdentityProvider({
    region: process.env.AWS_REGION,
  });

  const params = {
    UserPoolId: poolData.UserPoolId,
    Username: req.session?.user?.username,
  };

  client.adminGetUser(params, (err, data) => {
    if (err) {
      winstonLogger.error(
        `[isAdmin]: Unauthorized - [UserId]: ${req.session.user?.sub} - ${err}`
      );
      return res.status(401).json({ message: 'Unauthorized: Invalid token' });
    } else {
      if (!data?.Enabled) {
        winstonLogger.error(
          `[isAdmin]: Unauthorized - [UserId]: ${req.session.user?.sub} - User is disabled`
        );
        return res
          .status(401)
          .json({ message: 'Unauthorized: User is disabled' });
      } else {
        next();
      }
    }
  });
};

export const isAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  await isAuthenticated(req, res, async () => {
    try {
      console.log('hello');

      const params = {
        UserPoolId: poolData.UserPoolId,
        Username: req.session?.user?.username,
      };

      const client = new CognitoIdentityProvider({
        region: process.env.AWS_REGION,
      });
      const groups = await client.adminListGroupsForUser(params);

      const userGroups = groups.Groups?.map((group) => group.GroupName || '');

      if (!userGroups || userGroups === undefined) {
        winstonLogger.error(
          `[isAdmin]: Unauthorized - [UserId]: ${req.session.user?.sub} - User does not have any groups`
        );
        return res
          .status(401)
          .json({ message: "Unauthorized: User doesn't belong to a group" });
      }
      if (userGroups.length === 0) {
        winstonLogger.error(
          `[isAdmin]: Unauthorized - [UserId]: ${req.session.user?.sub} - User does not have any groups`
        );
        return res
          .status(401)
          .json({ message: "Unauthorized: User doesn't belong to a group" });
      }
      const isAdmin = userGroups.includes('Admin');

      if (!isAdmin) {
        winstonLogger.error(
          `[isAdmin]: Unauthorized - [UserId]: ${req.session.user?.sub} - User is not an admin`
        );
        return res
          .status(401)
          .json({ message: 'Unauthorized: no permissions' });
      }

      next();
    } catch (error) {
      winstonLogger.error(`[isAdmin]: ${error}`);
      return res.status(401).json({ message: 'Unauthorized: Invalid token' });
    }
  });
};
