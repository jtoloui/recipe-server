import { ConfigParams } from 'express-openid-connect';

export const config: ConfigParams = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.AUTH0_SECRET || '',
  baseURL: 'https://localhost:3001',
  clientID: process.env.AUTH0_CLIENT_ID || '',
  clientSecret: process.env.AUTH0_CLIENT_SECRET || '',
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
  authorizationParams: {
    response_type: 'code',
    scope: 'openid profile email',
  },
  routes: {
    login: false,
    logout: '/auth/logout',
    postLogoutRedirect: `${process.env.WEB_APP_URI}/login` || '',
  },
  session: {
    cookie: {
      secure: true,
      httpOnly: true,
    },
    name: 'session_token',
  },
};
