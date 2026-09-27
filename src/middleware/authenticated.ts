import { CognitoIdentityProvider } from '@aws-sdk/client-cognito-identity-provider';
import { timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';

import { poolData } from '../auth/awsCognito';
import { refreshTokens } from '../auth/refresh';
import { JwtExpiredError } from 'aws-jwt-verify/error';

import { verifyIdToken } from '../auth/verifier';
import logger from '../logger/winston';
import { clearAuthCookies, destroyAuthSession, setAppSessionCookie } from '../utils/authCookies';

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
async function invalidateSession(req: Request, res: Response): Promise<void> {
  clearAuthCookies(res);
  const error = await destroyAuthSession(req);
  if (error) {
    winstonLogger.warn(`[isAuthenticated]: failed to destroy invalid session: ${error}`);
  }
}

export const isAuthenticated = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.session?.user?.username || !req.cookies?.app_session || !req.session.user) {
      winstonLogger.error(`[isAuthenticated]: Forbidden - No token provided`);
      await invalidateSession(req, res);
      return res.status(401).json({ message: 'Forbidden: No token provided' });
    }

    // Keep the app cookie bound to the access token in the signed server-side
    // session. Canonical cookie attributes prevent legitimate drift; a mismatch
    // means the browser must establish a fresh authenticated session.
    const expectedAppSession = req.session.user.tokens.AccessToken;
    const cookieMatches = !!expectedAppSession && safeEqual(req.cookies.app_session, expectedAppSession);
    if (!cookieMatches) {
      winstonLogger.warn(`[isAuthenticated]: app_session cookie does not match session token — re-login required`);
      await invalidateSession(req, res);
      return res.status(401).json({ message: 'Forbidden: Session mismatch' });
    }

    try {
      await verifyIdToken(req.session.user.tokens.IdToken);
    } catch (verifyError) {
      // A6: only an EXPIRED token is refreshable; a bad signature/audience is not.
      if (!isExpiredError(verifyError)) {
        winstonLogger.error(`[isAuthenticated]: Forbidden - Invalid token: ${verifyError}`);
        await invalidateSession(req, res);
        return res.status(401).json({ message: 'Forbidden: Invalid token' });
      }

      try {
        const refreshed = await refreshTokens(req.session.user.tokens.RefreshToken);
        // Verify the freshly-issued id token before trusting it.
        await verifyIdToken(refreshed.IdToken);

        // Persist the new tokens on the session and re-issue the app_session
        // cookie using the same canonical attributes as every login path.
        req.session.user.tokens.IdToken = refreshed.IdToken;
        req.session.user.tokens.AccessToken = refreshed.AccessToken;
        if (refreshed.RefreshToken) req.session.user.tokens.RefreshToken = refreshed.RefreshToken;
        setAppSessionCookie(res, refreshed.AccessToken);
        winstonLogger.info(`[isAuthenticated]: refreshed expired token for ${req.session.user.sub}`);
      } catch (refreshError) {
        winstonLogger.warn(`[isAuthenticated]: refresh failed, re-login required: ${refreshError}`);
        await invalidateSession(req, res);
        return res.status(401).json({ message: 'Forbidden: Session expired' });
      }
    }

    return next();
  } catch (error) {
    winstonLogger.error(`[isAuthenticated]: Unauthorized - [UserId]: ${req.session?.user?.sub} - ${error}`);
    await invalidateSession(req, res);
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
      // On Lambda there are no static keys: omit credentials so the SDK uses the
      // execution role via the default provider chain. Passing empty-string keys
      // overrides the chain and yields "security token is invalid".
      // Never use the reserved Lambda runtime creds (they lack the session token
      // here) — on Lambda, omit creds and use the execution role. Static keys are
      // local-dev only. AWS_LAMBDA_FUNCTION_NAME is set iff running in Lambda.
      const useStaticKeys =
        !process.env.AWS_LAMBDA_FUNCTION_NAME &&
        !!process.env.AWS_ACCESS_KEY_ID &&
        !!process.env.AWS_SECRET_ACCESS_KEY;
      const client = new CognitoIdentityProvider({
        region: process.env.AWS_REGION,
        ...(useStaticKeys
          ? {
              credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
              },
            }
          : {}),
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
