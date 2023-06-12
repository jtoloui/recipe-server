// import { ConfigParams } from 'express-openid-connect';

// import { authenticationClient } from '../auth/auth0Client';

// // strip the protocol from the URI and subdomain
// // e.g. https://api.jamietoloui.com -> .jamietoloui.com

// const domain = process.env.API_APP_URI || '';
// const domainParts = domain.split('.');
// const domainRoot = domainParts.slice(1).join('.');
// const domainRootWithDot = `.${domainRoot}`;

// export const config: ConfigParams = {
//   authRequired: false,
//   auth0Logout: true,
//   secret: process.env.AUTH0_SECRET || '',
//   baseURL: process.env.API_APP_URI || '',
//   clientID: process.env.AUTH0_CLIENT_ID || '',
//   clientSecret: process.env.AUTH0_CLIENT_SECRET || '',
//   issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
//   authorizationParams: {
//     response_type: 'code',
//     scope: 'openid profile email',
//   },
//   routes: {
//     login: false,
//     logout: '/auth/logout',
//     postLogoutRedirect: `${process.env.WEB_APP_URI}/login` || '',
//   },
//   session: {
//     cookie: {
//       secure: true,
//       httpOnly: true,
//       domain: process.env.API_APP_URI ? domainRootWithDot : 'localhost',
//     },
//     name: 'session_token',
//   },
//   afterCallback: async (req, res, session, decodedState) => {
//     const userProfile = await authenticationClient.getProfile(
//       session.access_token
//     );

//     return {
//       ...session,
//       userProfile: {
//         ...userProfile,
//       }, // access using `req.session_token.userProfile
//     };
//   },
// };
