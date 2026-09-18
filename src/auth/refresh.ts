import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';

export interface RefreshedTokens {
  IdToken: string;
  AccessToken: string;
  /**
   * Cognito does NOT return a new refresh token on REFRESH_TOKEN_AUTH, so the
   * caller keeps re-using the existing one until it expires. Present here only
   * if Cognito ever returns one.
   */
  RefreshToken?: string;
}

// Reused across invocations (Lambda-safe, like the verifier).
const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

/**
 * Exchange a Cognito refresh token for fresh ID + access tokens
 * (RECON-FINDINGS A6). Previously the stored refresh token was never used —
 * an expired session simply forced a re-login.
 *
 * Reads the app client id from env directly rather than importing awsCognito
 * (which constructs a CognitoUserPool at module load and throws when the pool
 * env vars are absent). Rejects if Cognito declines the refresh
 * (expired/revoked) or returns no AuthenticationResult; callers translate that
 * into "re-login required".
 */
export async function refreshTokens(refreshToken: string): Promise<RefreshedTokens> {
  const command = new InitiateAuthCommand({
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    ClientId: process.env.AWS_COGNITO_CLIENT_ID || '',
    AuthParameters: { REFRESH_TOKEN: refreshToken },
  });

  const response = await client.send(command);
  const result = response.AuthenticationResult;

  if (!result?.IdToken || !result.AccessToken) {
    throw new Error('Refresh failed: no tokens returned');
  }

  return {
    IdToken: result.IdToken,
    AccessToken: result.AccessToken,
    RefreshToken: result.RefreshToken,
  };
}
