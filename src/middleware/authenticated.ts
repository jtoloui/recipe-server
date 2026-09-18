import { CognitoIdentityProvider } from '@aws-sdk/client-cognito-identity-provider';
import { NextFunction, Request, Response } from 'express';

import { poolData } from '../auth/awsCognito';
import { verifyIdToken } from '../auth/verifier';
import logger from '../logger/winston';

const winstonLogger = logger('info', 'Authentication Middleware');

/**
 * Authenticate a request by verifying its Cognito ID token.
 *
 * A4: uses the cached `aws-jwt-verify` verifier (src/auth/verifier.ts), which
 * validates signature, issuer, audience, expiry and token-use in one call and
 * caches the JWKS. This replaces the previous per-request pattern here:
 * `new CognitoIdentityProvider()` + `adminGetUser` + an HTTP JWKS fetch +
 * `jwk-to-pem` + a hand-rolled `jwt.verify` with manual iss/aud checks.
 */
export const isAuthenticated = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.session?.user?.username || !req.cookies?.app_session || !req.session.user) {
      winstonLogger.error(`[isAuthenticated]: Forbidden - No token provided`);
      return res.status(401).json({ message: 'Forbidden: No token provided' });
    }

    const sessionToken = req.session.user.tokens.IdToken;

    try {
      // Note: this verifies the ID token (signature, issuer, audience, expiry,
      // token-use) but does NOT call adminGetUser to check user.Enabled — a
      // disabled Cognito user retains access until their ID token expires
      // (max ~1h). Accepted tradeoff to drop a per-request admin API call;
      // revisit if immediate disable-on-demand is required.
      await verifyIdToken(sessionToken);
    } catch (verifyError) {
      winstonLogger.error(`[isAuthenticated]: Forbidden - Invalid token: ${verifyError}`);
      return res.status(401).json({ message: 'Forbidden: Invalid token' });
    }

    return next();
  } catch (error) {
    winstonLogger.error(`[isAuthenticated]: Unauthorized - [UserId]: ${req.session?.user?.sub} - ${error}`);
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
};

export const isAdmin = async (req: Request, res: Response, next: NextFunction) => {
  await isAuthenticated(req, res, async () => {
    try {
      const params = {
        UserPoolId: poolData.UserPoolId,
        Username: req.session?.user?.username,
      };
      const client = new CognitoIdentityProvider({
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        },
      });

      const groups = await client.adminListGroupsForUser(params);

      const userGroups = groups.Groups?.map((group) => group.GroupName || '');

      if (!userGroups || userGroups.length === 0) {
        winstonLogger.error(
          `[isAdmin]: Unauthorized - [UserId]: ${req.session.user?.sub} - User does not have any groups`
        );
        return res.status(401).json({ message: "Unauthorized: User doesn't belong to a group" });
      }

      const isAdmin = userGroups.includes('Admin');

      if (!isAdmin) {
        winstonLogger.error(`[isAdmin]: Unauthorized - [UserId]: ${req.session.user?.sub} - User is not an admin`);
        return res.status(401).json({ message: 'Unauthorized: no permissions' });
      }

      return next();
    } catch (error) {
      winstonLogger.error(`[isAdmin]: ${error}`);
      return res.status(401).json({ message: 'Unauthorized: Invalid token' });
    }
  });
};
