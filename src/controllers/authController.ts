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
import { Request, Response } from 'express';
import { JwtPayload, decode } from 'jsonwebtoken';

import { managementClient } from '../auth/auth0Client';
import { userPool } from '../auth/awsCognito';
import logger from '../logger/winston';

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

export class AuthController {
  private logger: ReturnType<typeof logger>;

  constructor() {
    const logLevel = process.env.LOG_LEVEL || 'info';
    this.logger = logger(logLevel, 'AuthController');
  }

  deleteUser = async (
    req: Request<unknown, unknown, deleteUserBody>,
    res: Response
  ) => {
    try {
      const { id } = req.body;
      const user = await managementClient.getUser({ id });

      const deleted = await managementClient.deleteUser({
        id: user.user_id ?? '',
      });

      return res.status(200).json({ message: 'User deleted', deleted });
    } catch (error) {
      this.logger.error('Error deleting user:', error);
      return res.status(500).json({
        message: 'Error deleting user',
        error: error,
      });
    }
  };

  getAllUsers = async (req: Request, res: Response) => {
    try {
      const client = new CognitoIdentityServiceProvider({
        region: process.env.AWS_COGNITO_REGION,
      });
      const params: ListUsersRequest = {
        UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID || '',
      };

      const usersResp = await client.listUsers(params);
      if (!usersResp.Users) {
        this.logger.error('Error fetching users');
        return res.status(500).json({ message: 'Error fetching users' });
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
          {}
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

      return res.status(200).json({ users: users || [] });
    } catch (error) {
      this.logger.error('Error fetching users:', error);
      return res.status(500).json({ message: 'Error fetching users', error });
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

  logout = async (req: Request, res: Response) => {
    const { user } = req.session;

    if (!user) {
      return res.status(401).json({ message: 'Not logged in' });
    }

    const {
      username,
      tokens: { IdToken, AccessToken, RefreshToken },
    } = user;

    if (!IdToken) {
      return res.status(401).json({ message: 'Invalid session' });
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
      })
    );

    cognitoUser.globalSignOut({
      onSuccess: (mes) => {
        req.session.destroy((err) => {
          if (err) {
            console.error(err);
            return res.status(500).send('Failed to log out');
          }
        });
        res.clearCookie('app_session').clearCookie('connect.sid'); // Clear the access token cookie
        return res.status(200).send('Logged out successfully');
      },
      onFailure: (err) => {
        console.error(err);
        return res.status(500).send('Failed to sign out');
      },
    });
  };

  signUp = async (
    req: Request<unknown, unknown, signUpBody>,
    res: Response
  ) => {
    const { username, password, email, given_name, family_name } = req.body;

    const userAttributes = [];
    userAttributes.push(
      new CognitoUserAttribute({ Name: 'email', Value: email })
    );
    userAttributes.push(
      new CognitoUserAttribute({ Name: 'given_name', Value: given_name })
    );
    userAttributes.push(
      new CognitoUserAttribute({ Name: 'family_name', Value: family_name })
    );
    userAttributes.push(
      new CognitoUserAttribute({
        Name: 'updated_at',
        Value: new Date().getTime().toString(),
      })
    );

    userAttributes.push(
      new CognitoUserAttribute({
        Name: 'name',
        Value: `${given_name} ${family_name}`,
      })
    );

    userAttributes.push(
      new CognitoUserAttribute({
        Name: 'zoneinfo',
        Value: 'Europe/London',
      })
    );

    userPool.signUp(username, password, userAttributes, [], (err, result) => {
      if (err) {
        console.error(err);
        return res.status(400).send(err.message);
      } else {
        return res.status(200).send('User registration successful');
      }
    });
  };

  verifyEmail = async (
    req: Request<unknown, unknown, verifyBody>,
    res: Response
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
        return res.status(400).send(err.message);
      } else {
        console.log('User verification successful');

        return res.status(200).send('User verification successful');
      }
    });
  };

  forgotPassword = async (
    req: Request<null, null, forgotPasswordBody>,
    res: Response
  ) => {
    const { username } = req.body;

    const userData = {
      Username: username,
      Pool: userPool,
    };

    const cognitoUser = new CognitoUser(userData);

    cognitoUser.forgotPassword({
      onSuccess: function (result) {
        console.log('call result: ' + result);
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
    res: Response
  ) => {
    const { username, code, password } = req.body;

    const userData = {
      Username: username,
      Pool: userPool,
    };

    const cognitoUser = new CognitoUser(userData);

    cognitoUser.confirmPassword(code, password, {
      onSuccess: function (result) {
        console.log('call result: ' + result);
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
    const { code } = req.query;

    if (!code) {
      // If there's no code, handle the error
      this.logger.error('Authentication failed');
      res.status(400).send('Authentication failed');
      return;
    }

    const params = {
      grant_type: 'authorization_code',
      client_id: process.env.AWS_COGNITO_CLIENT_ID,
      code,
      redirect_uri: 'https://localhost:3001/auth/callback', // replace with your actual redirect URI
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
        }
      );

      const { id_token, access_token, refresh_token } = response.data;

      interface ExJwtPayload extends JwtPayload {
        sub: string;
        'cognito:username': string;
      }
      const decoded = decode(id_token) as ExJwtPayload;

      req.session.user = {
        username: decoded['cognito:username'],
        sub: decoded.sub,
        tokens: {
          IdToken: id_token,
          AccessToken: access_token,
          RefreshToken: refresh_token,
        },
      };

      // At this point, the application should store these tokens securely and use them for subsequent API requests.
      return res.status(200).json({ id_token, access_token, refresh_token });
    } catch (error) {
      console.log(JSON.stringify(error, null, 2));

      res.status(500).send(JSON.stringify(error));
    }
  };

  isAuthenticated = async (req: Request, res: Response) => {
    if (req.session.user?.username) {
      return res.json({ isAuthenticated: true });
    } else {
      this.logger.error('User is not authenticated');
      return res.status(401).json({ isAuthenticated: false });
    }
  };
}
