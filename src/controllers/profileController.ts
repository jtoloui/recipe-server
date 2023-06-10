import { Request, Response } from 'express';

import logger from '../logger/winston';

export class ProfileController {
  private logger: ReturnType<typeof logger>;

  constructor() {
    const logLevel = process.env.LOG_LEVEL || 'info';
    this.logger = logger(logLevel, 'RecipeController');
  }

  // TODO: Implement this
  getProfile = async (req: Request, res: Response) => {
    try {
      const profile = req.session?.user;
      if (!profile) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      return res.status(200).json({
        name: profile?.name,
        email: profile.email,
        id: profile?.sub,
        nickname: profile?.name,
        givenName: profile?.givenName,
        familyName: profile?.familyName,
        userName: profile?.username,
      });
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - ${error}`);
      return res.status(500).json({ message: 'Error retrieving profile' });
    }
  };
}
