import express from 'express';

import { AuthController } from '../controllers/authController';
import { isAdmin } from '../middleware/authenticated';
import { ConfigType } from '../config/config';

export const authRoutes = (config: ConfigType) => {
  const router = express.Router();
  const authController = new AuthController({
    logger: config.newLogger(config.logLevel, 'AuthController'),
    accessKeyId: config.awsAccessKeyId,
    secretAccessKey: config.awsSecretAccessKey,
    cognitoRegion: config.awsRegion,
  });

  router.post('/delete/user', isAdmin, authController.deleteUser);
  router.get('/users', isAdmin, authController.getAllUsers);
  router.post('/login', authController.login);
  router.get('/login-social', authController.loginSocial);
  router.get('/logout', authController.logout);
  router.post('/register', authController.signUp);
  router.post('/verify/email', authController.verifyEmail);
  router.post(
    '/resend/verification-code',
    authController.resendVerificationCode,
  );
  router.post('/forgot-password', authController.forgotPassword);
  router.post('/forgot-password/confirm', authController.forgotPasswordConfirm);
  router.get('/callback', authController.callBack);
  router.get('/authenticated', authController.isAuthenticated);

  return router;
};
