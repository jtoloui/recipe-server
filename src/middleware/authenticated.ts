import { CognitoIdentityProvider } from '@aws-sdk/client-cognito-identity-provider';
import { timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';

import { poolData } from '../auth/awsCognito';
import { verifyIdToken } from '../auth/verifier';
import logger from '../logger/winston';

const winstonLogger = logger('info', 'Authentication Middleware');

/**
 * Constant-time string comparison to avoid leaking length/content via timing.
 * Returns false for any length mismatch.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Authenticate a request by verifying its Cognito ID token.
 *
 * A4: uses the cached `aws-jwt-verify` verifier (src/auth/verifier.ts).
 * A5: the `app_session` cookie is now VALIDATED against the session's stored
 * access token, not merely checked for presence. Previously any non-empty
 * `app_session` value passed the guard; the cookie was a presence flag only.
 */
export const isAuthenticated = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.session?.user?.username || !req.cookies?.app_session || !req.session.user) {
      winstonLogger.error(`[isAuthenticated]: Forbidden - No token provided`);
      return res.status(401).json({ message: 'Forbidden: No token provided' });
    }

    // A5: the app_session cookie must match the access token we issued for this
    // session — a non-empty-but-wrong cookie must NOT pass.
    const expectedAppSession = req.session.user.tokens.AccessToken;
    if (!expectedAppSession || !safeEqual(req.cookies.app_session, expectedAppSession)) {
      winstonLogger.warn(`[isAuthenticated]: Forbidden - app_session cookie does not match session`);
      return res.status(401).json({ message: 'Forbidden: Invalid session' });
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
