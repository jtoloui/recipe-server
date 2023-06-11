import { CognitoIdentityProvider } from '@aws-sdk/client-cognito-identity-provider';
import axios from 'axios';
import { NextFunction, Request, Response } from 'express';
import jwt, { JwtHeader } from 'jsonwebtoken';
import jwkToPem, { RSA } from 'jwk-to-pem';

import { poolData } from '../auth/awsCognito';
import logger from '../logger/winston';

const winstonLogger = logger('info', 'Authentication Middleware');
const client = new CognitoIdentityProvider({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

interface MyJWK extends RSA {
  kid: string;
}
export const isAuthenticated = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const sessionToken = req.session?.user?.tokens?.IdToken;
    const cookieToken = req.cookies?.app_session;
    const userName = req.session?.user?.username;

    if (!sessionToken || !userName || !cookieToken) {
      winstonLogger.error(`[isAuthenticated]: Forbidden - No token provided`);
      return res.status(401).json({ message: 'Forbidden: No token provided' });
    }

    const params = {
      UserPoolId: poolData.UserPoolId,
      Username: req.session?.user?.username,
    };

    const user = await client.adminGetUser(params);

    if (!user.Enabled) {
      winstonLogger.error(
        `[isAdmin]: Unauthorized - [UserId]: ${req.session.user?.sub} - User is disabled`
      );
      return res
        .status(401)
        .json({ message: 'Unauthorized: User is disabled' });
    }

    // Get JWT header
    const { header } = jwt.decode(sessionToken, { complete: true }) as {
      header: JwtHeader;
    };

    // Fetch the public JWKS
    const {
      data: { keys },
    } = await axios.get<{ keys: MyJWK[] }>(
      `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${poolData.UserPoolId}/.well-known/jwks.json`
    );

    // Find the public key that matches the JWT header
    const publicKey = keys.find((key) => key.kid === header.kid);

    if (!publicKey) {
      winstonLogger.error(`[isAuthenticated]: Forbidden - Invalid token`);
      return res.status(401).json({ message: 'Forbidden: Invalid token' });
    }

    // Convert the JWK to PEM format
    const pem = jwkToPem(publicKey);

    // Verify the JWT
    jwt.verify(
      sessionToken,
      pem,
      { algorithms: ['RS256'] },
      (err, decodedToken) => {
        if (err) {
          winstonLogger.error(`[isAuthenticated]: Forbidden - Invalid token`);
          return res.status(401).json({ message: 'Forbidden: Invalid token' });
        }

        if (typeof decodedToken !== 'object' || decodedToken === null) {
          winstonLogger.error(
            `[isAuthenticated]: Forbidden - Invalid token payload`
          );
          return res
            .status(401)
            .json({ message: 'Forbidden: Invalid token payload' });
        }

        // Validate the issuer
        if (
          decodedToken.iss !==
          `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${poolData.UserPoolId}`
        ) {
          winstonLogger.error(
            `[isAuthenticated]: Forbidden - Invalid token issuer`
          );
          return res
            .status(401)
            .json({ message: 'Forbidden: Invalid token issuer' });
        }

        // Validate the audience (app client ID)
        if (decodedToken.aud !== poolData.ClientId) {
          winstonLogger.error(
            `[isAuthenticated]: Forbidden - Invalid token audience`
          );
          return res
            .status(401)
            .json({ message: 'Forbidden: Invalid token audience' });
        }

        next();
      }
    );
  } catch (error) {
    winstonLogger.error(
      `[isAdmin]: Unauthorized - [UserId]: ${req.session.user?.sub} - ${error}`
    );
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
};

export const isAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  await isAuthenticated(req, res, async () => {
    try {
      const params = {
        UserPoolId: poolData.UserPoolId,
        Username: req.session?.user?.username,
      };

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
