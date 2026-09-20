import {
  CognitoIdentityProvider as CognitoIdentityServiceProvider,
  UpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { Request, Response } from 'express';
import { Logger } from 'winston';

import { getProfileResponse } from '../types/profile/controller';
import ResponseHandler from '../utils/responseHandler';

type updateProfileBody = {
  name?: string;
};

export interface profileControllerConfig {
  logger: Logger;
  cognitoRegion: string;
  accessKeyId: string;
  secretAccessKey: string;
}

interface Profile {
  getProfile: (req: Request, res: Response) => Promise<Response<getProfileResponse>>;
  updateProfile: (
    req: Request<unknown, unknown, updateProfileBody>,
    res: Response,
  ) => Promise<Response<getProfileResponse>>;
}

export class ProfileController implements Profile {
  private logger: Logger;
  private response: ResponseHandler;
  private client: CognitoIdentityServiceProvider;

  constructor(config: profileControllerConfig) {
    this.logger = config.logger;
    this.response = new ResponseHandler({ logger: this.logger });
    // Omit credentials on Lambda (no static keys) so the SDK uses the execution
    // role via the default provider chain; empty-string keys would override the
    // chain -> "security token invalid". Static keys are local-dev only and are
    // resolved to '' on Lambda by config.ts.
    const useStaticKeys = !!config.accessKeyId && !!config.secretAccessKey;
    this.client = new CognitoIdentityServiceProvider({
      region: config.cognitoRegion,
      ...(useStaticKeys
        ? {
            credentials: {
              accessKeyId: config.accessKeyId as string,
              secretAccessKey: config.secretAccessKey as string,
            },
          }
        : {}),
    });
  }

  getProfile = async (req: Request, res: Response<getProfileResponse>) => {
    try {
      const profile = req.session.user;
      if (!profile) {
        return this.response.sendError(res, 401, 'Unauthorized');
      }

      const profileResponse = {
        name: profile.name,
        email: profile.email,
        id: profile.sub,
        nickname: profile.name,
        givenName: profile.givenName,
        familyName: profile.familyName,
        userName: profile.username,
      };
      return this.response.sendSuccess(res, profileResponse);
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - Session ID: ${req.sessionID} - ${error}`);
      return this.response.sendError(res, 500, 'Error retrieving profile');
    }
  };

  updateProfile = async (
    req: Request<unknown, unknown, updateProfileBody>,
    res: Response<getProfileResponse>,
  ) => {
    try {
      const profile = req.session.user;
      if (!profile) {
        return this.response.sendError(res, 401, 'Unauthorized');
      }

      const accessToken = profile.tokens?.AccessToken;
      if (!accessToken) {
        return this.response.sendError(res, 401, 'Unauthorized');
      }

      const name = req.body.name?.trim();
      if (!name || name.length < 1 || name.length > 100) {
        return this.response.sendError(res, 400, 'Name must be between 1 and 100 characters');
      }

      await this.client.send(
        new UpdateUserAttributesCommand({
          AccessToken: accessToken,
          UserAttributes: [{ Name: 'name', Value: name }],
        }),
      );

      // Reflect the change in the session so getProfile returns it immediately.
      req.session.user = { ...profile, name };

      const profileResponse = {
        name,
        email: profile.email,
        id: profile.sub,
        nickname: name,
        givenName: profile.givenName,
        familyName: profile.familyName,
        userName: profile.username,
      };
      return this.response.sendSuccess(res, profileResponse);
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - Session ID: ${req.sessionID} - ${error}`);
      const errName = (error as { name?: string })?.name;
      if (errName === 'NotAuthorizedException') {
        return this.response.sendError(res, 401, 'Session expired — please sign in again');
      }
      return this.response.sendError(res, 500, 'Error updating profile');
    }
  };
}
