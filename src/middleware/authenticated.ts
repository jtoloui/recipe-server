import { CognitoIdentityProvider } from '@aws-sdk/client-cognito-identity-provider';
import { timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';

import { poolData } from '../auth/awsCognito';
import { refreshTokens } from '../auth/refresh';
import { JwtExpiredError } from 'aws-jwt-verify/error';

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

/** True when a jwt-verify failure is due to expiry specifically (vs a bad signature/aud). */
function isExpiredError(err: unknown): boolean {
  return err instanceof JwtExpiredError;
}

/**
 * Authenticate a request by verifying its Cognito ID token.
 *
 * A4: cached `aws-jwt-verify` verifier. A5: `app_session` cookie validated
 * against the session's access token. A6: on an EXPIRED id token, transparently
 * refresh via the stored refresh token instead of 401-ing; only a genuine
 * verification failure (bad signature/audience) or a failed refresh rejects.
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

    try {
      await verifyIdToken(req.session.user.tokens.IdToken);
    } catch (verifyError) {
      // A6: only an EXPIRED token is refreshable; a bad signature/audience is not.
      if (!isExpiredError(verifyError)) {
        winstonLogger.error(`[isAuthenticated]: Forbidden - Invalid token: ${verifyError}`);
        return res.status(401).json({ message: 'Forbidden: Invalid token' });
      }

      try {
        const refreshed = await refreshTokens(req.session.user.tokens.RefreshToken);
        // Verify the freshly-issued id token before trusting it.
        await verifyIdToken(refreshed.IdToken);

        // Persist the new tokens on the session and re-issue the app_session
        // cookie so the A5 check keeps matching on subsequent requests.
        req.session.user.tokens.IdToken = refreshed.IdToken;
        req.session.user.tokens.AccessToken = refreshed.AccessToken;
        if (refreshed.RefreshToken) req.session.user.tokens.RefreshToken = refreshed.RefreshToken;
        // Same cookie attributes as the login set-sites (authController) for consistency.
        res.cookie('app_session', refreshed.AccessToken, {
          httpOnly: true,
          secure: true,
          domain: `.${process.env.COOKIE_DOMAIN}`,
        });
        winstonLogger.info(`[isAuthenticated]: refreshed expired token for ${req.session.user.sub}`);
      } catch (refreshError) {
        winstonLogger.warn(`[isAuthenticated]: refresh failed, re-login required: ${refreshError}`);
        return res.status(401).json({ message: 'Forbidden: Session expired' });
      }
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
