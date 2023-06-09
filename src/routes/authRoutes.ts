import express from 'express';

import { AuthController } from '../controllers/authController';
import { isAdmin } from '../middleware/authenticated';

const router = express.Router();
const authController = new AuthController();

router.post('/delete/user', isAdmin, authController.deleteUser);
router.get('/users', isAdmin, authController.getAllUsers);
router.post('/login', authController.login);
router.get('/login-social', authController.loginSocial);
router.post('/logout', authController.logout);
router.post('/register', authController.signUp);
router.post('/verify/email', authController.verifyEmail);
router.post('/forgot-password', authController.forgotPassword);
router.post('/forgot-password/confirm', authController.forgotPasswordConfirm);
router.get('/callback', authController.callBack);
router.get('/authenticated', authController.isAuthenticated);

export default router;
