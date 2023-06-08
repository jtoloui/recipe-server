import { CognitoUserPool } from 'amazon-cognito-identity-js';

const poolData = {
  UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID || '',
  ClientId: process.env.AWS_COGNITO_CLIENT_ID || '',
};

export const userPool = new CognitoUserPool({
  UserPoolId: poolData.UserPoolId,
  ClientId: poolData.ClientId,
});

export const jwkUri = `https://cognito-idp.eu-west-2.amazonaws.com/${poolData.UserPoolId}/.well-known/jwks.json`;
