import { ConfigParams } from 'express-openid-connect';
import { authenticationClient } from '../auth/auth0Client';

export const config: ConfigParams = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.AUTH0_SECRET || '',
  baseURL: 'https://api.jamietoloui.com',
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
      domain: '.jamietoloui.com',
    },
    name: 'session_token',
  },
  afterCallback: async (req, res, session, decodedState) => {
    const userProfile = await authenticationClient.getProfile(
      session.access_token
    );

    return {
      ...session,
      userProfile: {
        ...userProfile,
      }, // access using `req.session_token.userProfile
    };
  },
};
