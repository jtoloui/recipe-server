import { Router } from 'express';
import { ProfileController } from '../controllers/profileController';

import { requiresAuth } from 'express-openid-connect';

const router = Router();

const profileController = new ProfileController();

router.get('/', requiresAuth(), profileController.getProfile);

export default router;
