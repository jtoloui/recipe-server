import { Router } from 'express';
import { requiresAuth } from 'express-openid-connect';

import { ProfileController } from '../controllers/profileController';

const router = Router();

const profileController = new ProfileController();

router.get('/', requiresAuth(), profileController.getProfile);

export default router;
