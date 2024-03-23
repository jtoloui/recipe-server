import { Request, Response } from 'express';
import { Logger } from 'winston';

import { controllerConfig } from '../types/controller/controller';
import { getProfileResponse } from '../types/profile/controller';
import ResponseHandler from '../utils/responseHandler';

interface Profile {
  getProfile: (req: Request, res: Response) => Promise<Response<getProfileResponse>>;
}

export class ProfileController implements Profile {
  private logger: Logger;
  private response: ResponseHandler;

  constructor(config: controllerConfig) {
    this.logger = config.logger;
    this.response = new ResponseHandler({ logger: this.logger });
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
      this.logger.error(`Request ID: ${req.id} - ${error}`);
      return this.response.sendError(res, 500, 'Error retrieving profile');
    }
  };
}
