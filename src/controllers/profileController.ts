import { Request, Response } from 'express';

import { getProfileResponse } from '../types/profile/controller';
import { controllerConfig } from '../config/config';
import { Logger } from 'winston';

interface Profile {
  getProfile: (
    req: Request,
    res: Response,
  ) => Promise<Response<getProfileResponse>>;
}

export class ProfileController implements Profile {
  private logger: Logger;

  constructor(config: controllerConfig) {
    this.logger = config.logger;
  }

  getProfile = async (req: Request, res: Response<getProfileResponse>) => {
    try {
      const profile = req.session.user;
      if (!profile) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      return res.status(200).json({
        name: profile.name,
        email: profile.email,
        id: profile.sub,
        nickname: profile.name,
        givenName: profile.givenName,
        familyName: profile.familyName,
        userName: profile.username,
      });
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - ${error}`);
      return res.status(500).json({ message: 'Error retrieving profile' });
    }
  };
}
