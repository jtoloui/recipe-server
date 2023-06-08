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
import express, { Request, Response } from 'express';
import { JwtPayload, decode } from 'jsonwebtoken';

import { managementClient } from '../auth/auth0Client';
import { userPool } from '../auth/awsCognito';
import { isAdmin } from '../middleware/auth';

const router = express.Router();

router.post('/delete/user', isAdmin, async (req: Request, res: Response) => {
  const { id } = req.body;

  try {
    const user = await managementClient.getUser({ id });

    const deleted = await managementClient.deleteUser({
      id: user.user_id ?? '',
    });

    res.status(200).json({ message: 'User deleted', deleted });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      message: 'Error deleting user',
      error: error,
    });
  }
});

router.get('/users', isAdmin, async (req: Request, res: Response) => {
  try {
    const users = await managementClient.getUsers();

    return res.status(200).json({ message: 'Users fetched', users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ message: 'Error fetching users', error });
  }
});

router.post('/login', (req, res) => {
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
      req.session.user = {
        username,
        sub: result.getIdToken().payload.sub,
        tokens: {
          IdToken: result.getIdToken().getJwtToken(),
          AccessToken: result.getAccessToken().getJwtToken(),
          RefreshToken: result.getRefreshToken().getToken(),
        },
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
});

router.post('/forgot-password', (req, res) => {
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
});

router.post('/forgot-password/confirm', (req, res) => {
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
});

router.post('/register', (req, res) => {
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
});

router.post('/verify-email', (req, res) => {
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
});

router.post('/logout', (req, res) => {
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
});

router.get('/authenticated', (req: Request, res: Response) => {
  if (req.oidc.isAuthenticated()) {
    return res.json({ isAuthenticated: true });
  } else {
    return res.json({ isAuthenticated: false });
  }
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    // If there's no code, handle the error
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
      `https://toloui-recipe.auth.eu-west-2.amazoncognito.com/oauth2/token`,
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
});

export default router;
