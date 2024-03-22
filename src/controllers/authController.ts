import {
  CognitoIdentityProvider as CognitoIdentityServiceProvider,
  ListUsersRequest,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  AuthenticationDetails,
  CognitoAccessToken,
  CognitoIdToken,
  CognitoRefreshToken,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import axios from 'axios';
import crypto from 'crypto';
import { Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { Logger } from 'winston';

import { poolData, userPool } from '../auth/awsCognito';
import { authControllerConfig } from '../types/controller/controller';
import ResponseHandler from '../utils/responseHandler';

type deleteUserBody = {
  id: string;
};

type signUpBody = {
  username: string;
  password: string;
  email: string;
  given_name: string;
  family_name: string;
};

type forgotPasswordBody = {
  username: string;
};

type verifyBody = {
  username: string;
  code: string;
};

type forgotPasswordConfirmBody = {
  username: string;
  code: string;
  password: string;
};

type callBackParams = {
  code: string;
  state: string;
};

interface UserAttributes {
  username: string;
  sub?: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  full_name: string;
}

type loginBody = {
  username: string;
  password: string;
};

type loginSocialQuery = {
  type: 'Google';
};

type resendVerificationCodeBody = {
  username: string;
};

// const winstonLogger = logger('info', 'Auth Controller');

// const client = new CognitoIdentityServiceProvider({
//   region: process.env.AWS_COGNITO_REGION,
//   credentials: {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
//   },
// });

// const addUserToUserGroup = async (username: string) => {
//   const params = {
//     Username: username,
//     UserPoolId: poolData.UserPoolId,
//     GroupName: 'Users',
//   };

//   try {
//     await client.adminAddUserToGroup(params);
//     winstonLogger.info(`User ${username} added to group: "User".`);
//   } catch (error) {
//     winstonLogger.error(`Error adding user ${username} to group: "User".`);
//     throw error;
//   }
// };

interface Auth {
  login: (req: Request<unknown, unknown, loginBody>, res: Response) => void;
  loginSocial: (req: Request<loginSocialQuery>, res: Response) => void;
  logout: (req: Request, res: Response) => void;
  signUp: (req: Request<unknown, unknown, signUpBody>, res: Response) => void;
  verifyEmail: (
    req: Request<unknown, unknown, verifyBody>,
    res: Response,
  ) => void;
  resendVerificationCode: (
    req: Request<unknown, unknown, resendVerificationCodeBody>,
    res: Response,
  ) => void;
  forgotPassword: (
    req: Request<null, null, forgotPasswordBody>,
    res: Response,
  ) => void;
  forgotPasswordConfirm: (
    req: Request<null, null, forgotPasswordConfirmBody>,
    res: Response,
  ) => void;
  callBack: (req: Request<callBackParams>, res: Response) => void;
  isAuthenticated: (req: Request, res: Response) => void;
}

export class AuthController implements Auth {
  private logger: Logger;
  private client: CognitoIdentityServiceProvider;
  private response: ResponseHandler;

  constructor(config: authControllerConfig) {
    this.logger = config.logger;
    this.response = new ResponseHandler({ logger: this.logger });
    this.client = new CognitoIdentityServiceProvider({
      region: config.cognitoRegion,
      credentials: {
        accessKeyId: config.accessKeyId || '',
        secretAccessKey: config.secretAccessKey || '',
      },
    });
  }

  deleteUser = async (
    req: Request<unknown, unknown, deleteUserBody>,
    res: Response,
  ) => {
    // try {
    //   const { id } = req.body;
    //   const user = await managementClient.getUser({ id });
    //   const deleted = await managementClient.deleteUser({
    //     id: user.user_id ?? '',
    //   });
    //   return res.status(200).json({ message: 'User deleted', deleted });
    // } catch (error) {
    //   this.logger.error('Error deleting user:', error);
    //   return res.status(500).json({
    //     message: 'Error deleting user',
    //     error: error,
    //   });
    // }
  };

  getAllUsers = async (req: Request, res: Response) => {
    try {
      const params: ListUsersRequest = {
        UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID || '',
      };

      const usersResp = await this.client.listUsers(params);
      if (!usersResp.Users) {
        this.logger.debug('No users found');
        return this.response.sendSuccess(res, { users: [] });
      }

      const users: UserAttributes[] = usersResp.Users.map((user) => {
        if (!user.Attributes) return null;

        const userAttributes = user.Attributes.reduce<Record<string, string>>(
          (acc, attribute) => {
            const attributeName: string = attribute.Name || '';
            const attributeValue: string = attribute.Value || '';
            return {
              ...acc,
              [attributeName]: attributeValue,
            };
          },
          {},
        );

        return {
          username: user.Username,
          sub: userAttributes.sub,
          email: userAttributes.email,
          given_name: userAttributes.given_name,
          family_name: userAttributes.family_name,
          full_name: `${userAttributes.given_name} ${userAttributes.family_name}`,
        } as UserAttributes;
      }).filter((user): user is UserAttributes => user !== null);

      return this.response.sendSuccess(res, { users });
    } catch (error) {
      this.logger.error('Error fetching users:', error);

      return this.response.sendError(res, 500, 'Error fetching users', error);
    }
  };

  login = async (req: Request<unknown, unknown, loginBody>, res: Response) => {
    const { username, password } = req.body;

    const authenticationDetails = new AuthenticationDetails({
      Username: username,
      Password: password,
    });

    const userData = {
      Username: username,
      Pool: userPool,
    };

    const cognitoUser = new CognitoUser(userData);

    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: function (result) {
        const accessToken = result.getAccessToken().getJwtToken();
        const userGroups: string[] | undefined = result
          .getIdToken()
          .decodePayload()['cognito:groups'];

        req.session.user = {
          username,
          name: result.getIdToken().payload.name,
          givenName: result.getIdToken().payload.given_name,
          familyName: result.getIdToken().payload.family_name,
          email: result.getIdToken().payload.email,
          sub: result.getIdToken().payload.sub,
          tokens: {
            IdToken: result.getIdToken().getJwtToken(),
            AccessToken: result.getAccessToken().getJwtToken(),
            RefreshToken: result.getRefreshToken().getToken(),
          },
          userGroups,
        };

        // Set the name of the cookie to 'myAppName_AccessToken'
        res.cookie('app_session', accessToken, {
          httpOnly: true,
          secure: true, // Uncomment this line if you are using HTTPS
        });

        return res.status(200).json({
          message: 'User logged in',
          result: result.getIdToken().payload,
        });
      },
      onFailure: function (err) {
        console.error(err);
        return res.status(400).json({ message: 'User login failed', err });
      },
    });
  };

  loginSocial = async (req: Request<loginSocialQuery>, res: Response) => {
    try {
      const { type } = req.query;

      if (type !== 'Google') {
        return res.status(400).json({ message: 'Invalid social login type' });
      }
      const clientId = process.env.AWS_COGNITO_CLIENT_ID;
      const callbackUrl = `${process.env.API_APP_URI}/auth/callback`;
      const responseType = 'CODE';
      const identityProvider = type;
      const AWSDomain = process.env.AWS_COGNITO_DOMAIN || '';

      const state = crypto.randomBytes(16).toString('hex');
      const nonce = crypto.randomBytes(16).toString('hex');

      req.session.state = state;
      req.session.nonce = nonce;

      const cognitoAuthUrl = `https://${AWSDomain}/oauth2/authorize?identity_provider=${identityProvider}&redirect_uri=${callbackUrl}&response_type=${responseType}&client_id=${clientId}&state=${state}&scope=email%20openid%20profile%20aws.cognito.signin.user.admin&nonce=${nonce}&prompt=login`;

      return this.response.sendSuccess(res, { redirectUrl: cognitoAuthUrl });
    } catch (error) {
      this.logger.error('Error logging in with social:', error);

      return this.response.sendError(
        res,
        500,
        'Error logging in with social',
        error,
      );
    }
  };

  // TODO: Fix this as logout isn't working
  // logout = async (req: Request, res: Response) => {
  //   const { user } = req.session;

  //   if (!user) {
  //     return res.status(401).json({ message: 'Not logged in' });
  //   }

  //   const {
  //     username,
  //     tokens: { IdToken, AccessToken, RefreshToken },
  //   } = user;

  //   const client = new CognitoIdentityServiceProvider({
  //     region: process.env.AWS_COGNITO_REGION,
  //   });
  //   client.adminUserGlobalSignOut(
  //     {
  //       UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID || '',
  //       Username: username,
  //     },
  //     (err, data) => {
  //       if (err) {
  //         console.error(err);
  //         return res.status(500).json({ message: 'Error logging out', err });
  //       }
  //       client.adminGetUser(
  //         {
  //           UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID || '',
  //           Username: username,
  //         },
  //         (err, data) => {
  //           if (err) {
  //             console.error(err);
  //             return res
  //               .status(500)
  //               .json({ message: 'Error logging out', err });
  //           }
  //           console.log('user info', data);
  //           return res.status(200).json({ message: 'User logged out' });
  //         }
  //       );
  //       req.session.destroy((err) => {
  //         if (err) {
  //           console.error(err);
  //           return res.status(500).json({ message: 'Error logging out', err });
  //         }
  //       });
  //       res.clearCookie('app_session');
  //       console.log(data);
  //       return res.status(200).json({ message: 'User logged out' });
  //     }
  //   );

  //   client.adminGetUser(
  //     {
  //       UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID || '',
  //       Username: username,
  //     },
  //     (err, data) => {
  //       if (err) {
  //         console.error(err);
  //         return res.status(500).json({ message: 'Error logging out', err });
  //       }
  //       console.log(data);
  //       return res.status(200).json({ message: 'User logged out' });
  //     }
  //   );

  //   const cognitoUser = new CognitoUser({
  //     Username: username,
  //     Pool: userPool,
  //   });

  //   cognitoUser.setSignInUserSession(
  //     new CognitoUserSession({
  //       IdToken: new CognitoIdToken({ IdToken }),
  //       AccessToken: new CognitoAccessToken({ AccessToken: AccessToken }),
  //       RefreshToken: new CognitoRefreshToken({ RefreshToken }),
  //     })
  //   );

  //   // console.log(cognitoUser);

  //   cognitoUser.globalSignOut({
  //     onSuccess: function (msg) {
  //       console.log(msg);

  //       console.log('User logged out successfully');
  //     },
  //     onFailure: function (err) {
  //       console.error('Error while logging out:', err);
  //     },
  //   });
  //   res.status(200).json({ message: 'User logged out' });
  // };

  logout = async (req: Request, res: Response) => {
    const { user } = req.session;
    if (!user) {
      this.logger.error('Not logged in');
      return this.response.sendError(res, 401, 'Not logged in');
    }

    const {
      username,
      tokens: { IdToken, AccessToken, RefreshToken },
      authType,
    } = user;
    if (!IdToken) {
      this.logger.error('Invalid session');
      return this.response.sendError(res, 401, 'Invalid session');
    }

    if (authType === 'social') {
      req.session.destroy((err) => {
        if (err) {
          this.logger.error('(Social) Error logging out:', err);

          return this.response.sendError(res, 500, 'Error logging out', err);
        }
      });
      res.clearCookie('app_session').clearCookie('connect.sid'); // Clear the access token cookie
      const logoutGoogle = `${process.env.AWS_COGNITO_DOMAIN}/logout?client_id=${process.env.AWS_COGNITO_CLIENT_ID}&logout_uri=${process.env.WEB_APP_URI}`;

      return this.response.sendSuccess(res, {
        message: 'User logged out',
        url: logoutGoogle,
      });
    }
    const cognitoUser = new CognitoUser({
      Username: username,
      Pool: userPool,
    });

    cognitoUser.setSignInUserSession(
      new CognitoUserSession({
        IdToken: new CognitoIdToken({ IdToken }),
        AccessToken: new CognitoAccessToken({ AccessToken: AccessToken }),
        RefreshToken: new CognitoRefreshToken({ RefreshToken }),
      }),
    );

    cognitoUser.globalSignOut({
      onSuccess: (mes) => {
        req.session.destroy((err) => {
          if (err) {
            this.logger.error('(Cognito) Error logging out:', err);

            return this.response.sendErrorNonJSON(
              res,
              500,
              'Error logging out',
            );
          }
        });
        res.clearCookie('app_session').clearCookie('connect.sid'); // Clear the access token cookie
        return this.response.sendSuccessNonJSON(res, 'Logged out successfully');
      },
      onFailure: (err) => {
        this.logger.error('(Cognito) Error logging out:', err);

        return this.response.sendErrorNonJSON(res, 500, 'Error logging out');
      },
    });
  };

  signUp = async (
    req: Request<unknown, unknown, signUpBody>,
    res: Response,
  ) => {
    const { username, password, email, given_name, family_name } = req.body;

    const userAttributes = [];
    userAttributes.push(
      new CognitoUserAttribute({ Name: 'email', Value: email }),
    );
    userAttributes.push(
      new CognitoUserAttribute({ Name: 'given_name', Value: given_name }),
    );
    userAttributes.push(
      new CognitoUserAttribute({ Name: 'family_name', Value: family_name }),
    );
    userAttributes.push(
      new CognitoUserAttribute({
        Name: 'updated_at',
        Value: new Date().getTime().toString(),
      }),
    );

    userAttributes.push(
      new CognitoUserAttribute({
        Name: 'name',
        Value: `${given_name} ${family_name}`,
      }),
    );

    userAttributes.push(
      new CognitoUserAttribute({
        Name: 'zoneinfo',
        Value: 'Europe/London',
      }),
    );

    try {
      userPool.signUp(username, password, userAttributes, [], async (err) => {
        if (err) {
          this.logger.error('Error signing up:', err);

          return this.response.sendError(res, 409, 'Error signing up', err);
        } else {
          return this.response.sendSuccess(res, 'User created successfully');
        }
      });
    } catch (error) {
      this.logger.error('Error confirming user:', error);

      return this.response.sendError(res, 500, 'Error confirming user', error);
    }
  };

  verifyEmail = async (
    req: Request<unknown, unknown, verifyBody>,
    res: Response,
  ) => {
    const { username, code } = req.body;

    const userData = {
      Username: username,
      Pool: userPool,
    };

    const cognitoUser = new CognitoUser(userData);

    cognitoUser.confirmRegistration(code, true, (err, result) => {
      if (err) {
        console.error(err);

        return this.response.sendError(res, 400, 'User verification failed', {
          error: err.message,
        });
      } else {
        return this.response.sendSuccess(res, 'User verification successful');
      }
    });
  };

  resendVerificationCode = async (
    req: Request<unknown, unknown, resendVerificationCodeBody>,
    res: Response,
  ) => {
    try {
      const { username } = req.body;
      await this.client.resendConfirmationCode({
        ClientId: poolData.ClientId || '',
        Username: username,
      });

      return res.status(200).json({ message: 'Code resent successfully' });
    } catch (error) {
      this.logger.error('Error resending code:', error);
      return res.status(400).json({ message: 'Error resending code' });
    }
  };

  forgotPassword = async (
    req: Request<null, null, forgotPasswordBody>,
    res: Response,
  ) => {
    const { username } = req.body;

    const userData = {
      Username: username,
      Pool: userPool,
    };

    const cognitoUser = new CognitoUser(userData);

    cognitoUser.forgotPassword({
      onSuccess: function (result) {
        return res.status(200).json({
          message: 'User password reset',
          result,
        });
      },
      onFailure: function (err) {
        console.error(err);
        return res
          .status(400)
          .json({ message: 'User password reset failed', err });
      },
    });
  };

  forgotPasswordConfirm = async (
    req: Request<null, null, forgotPasswordConfirmBody>,
    res: Response,
  ) => {
    const { username, code, password } = req.body;

    const userData = {
      Username: username,
      Pool: userPool,
    };

    const cognitoUser = new CognitoUser(userData);

    cognitoUser.confirmPassword(code, password, {
      onSuccess: function (result) {
        return res.status(200).json({
          message: 'User password reset confirmed',
          result,
        });
      },
      onFailure: function (err) {
        console.error(err);
        return res.status(400).json({
          message: 'User password reset confirmation failed',
          err,
        });
      },
    });
  };

  callBack = async (req: Request<callBackParams>, res: Response) => {
    const { code, state } = req.query;

    if (state !== req.session.state) {
      return res.status(400).json({ error: 'Invalid state parameter' });
    }

    if (!code) {
      // If there's no code, handle the error
      this.logger.error('Authentication failed');
      res.status(400).send('Authentication failed');
      return;
    }

    const callbackUrl = `${process.env.API_APP_URI}/auth/callback`;
    const params = {
      grant_type: 'authorization_code',
      client_id: process.env.AWS_COGNITO_CLIENT_ID,
      code,
      redirect_uri: callbackUrl, // replace with your actual redirect URI
    };

    try {
      const response = await axios.post(
        `https://${process.env.AWS_COGNITO_DOMAIN}/oauth2/token`,
        {
          ...params,
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      const { id_token, access_token, refresh_token } = response.data;

      interface ExJwtPayload extends JwtPayload {
        sub: string;
        'cognito:username': string;
        'cognito:groups'?: string[];
        provider?: {
          providerType: string;
          userId: string;
        };
      }

      const decoded = jwt.decode(id_token) as ExJwtPayload;

      req.session.user = {
        username: decoded['cognito:username'],
        name: decoded.name,
        email: decoded.email,
        givenName: decoded.given_name,
        familyName: decoded.family_name,
        sub: decoded.sub,
        tokens: {
          IdToken: id_token,
          AccessToken: access_token,
          RefreshToken: refresh_token,
        },
        userGroups: decoded['cognito:groups'] || [],
        authType: 'social',
        provider: {
          providerType: decoded.provider?.providerType || '',
          userId: decoded.provider?.userId || '',
        },
      };

      // At this point, the application should store these tokens securely and use them for subsequent API requests.
      // return res.status(200).json({ id_token, access_token, refresh_token });
      res.cookie('app_session', access_token, {
        httpOnly: true,
        secure: true,
      });
      return res.redirect(process.env.WEB_APP_URI || '');
    } catch (error) {
      this.logger.error('Error getting tokens:', error);

      res.status(500).send(JSON.stringify(error));
    }
  };

  isAuthenticated = async (req: Request, res: Response) => {
    try {
      const sessionToken = req.session?.user?.tokens?.IdToken;
      const cookieToken = req.cookies?.app_session;
      const userName = req.session?.user?.username;

      if (!sessionToken || !userName || !cookieToken) {
        req.session.destroy((err) => {
          if (err) {
            this.logger.error('Error destroying session:', err);
            return res.status(500).json({ isAuthenticated: false });
          }
        });
        return res.status(200).json({ isAuthenticated: false });
      }
      const decoded = jwt.decode(sessionToken);

      if (typeof decoded !== 'object' || decoded === null) {
        req.session.destroy((err) => {
          if (err) {
            this.logger.error('Error destroying session:', err);
            return res.status(500).json({ isAuthenticated: false });
          }
        });
        return res.status(200).json({ isAuthenticated: false });
      }

      const isExpired = this.isExpired(sessionToken);

      const params = {
        UserPoolId: poolData.UserPoolId,
        Username: req.session?.user?.username,
      };

      const user = await this.client.adminGetUser(params);

      if (!user.Enabled) {
        req.session.destroy((err) => {
          if (err) {
            this.logger.error('Error destroying session:', err);
            return res.status(500).json({ isAuthenticated: false });
          }
        });
        return res.status(200).json({ isAuthenticated: false });
      } else {
        if (isExpired) {
          req.session.destroy((err) => {
            if (err) {
              this.logger.error('Error destroying session:', err);
              return res.status(500).json({ isAuthenticated: false });
            }
          });
          return res.status(200).json({ isAuthenticated: false });
        } else {
          return res.status(200).json({ isAuthenticated: true });
        }
      }
    } catch (error) {
      this.logger.error('Error getting tokens:', error);
      req.session.destroy((err) => {
        if (err) {
          this.logger.error('Error destroying session:', err);
          return res.status(500).json({ isAuthenticated: false });
        }
      });
      return res.status(500).json({ isAuthenticated: false });
    }
  };

  isExpired = (token: string): boolean => {
    try {
      const decodedToken = jwt.decode(token); // Decode the token

      if (typeof decodedToken !== 'object' || decodedToken === null) {
        return true;
      }
      const dateNow = new Date();
      // Convert expiration time from seconds to milliseconds
      const tokenExpirationDate = new Date((decodedToken.exp || 0) * 1000);

      return tokenExpirationDate < dateNow;
    } catch (err) {
      // If token can't be decoded, consider it as expired
      return true;
    }
  };
}
