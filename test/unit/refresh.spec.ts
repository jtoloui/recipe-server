import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { refreshTokens } from '@/auth/refresh';

const cognitoMock = mockClient(CognitoIdentityProviderClient);

describe('refreshTokens (A6 refresh flow)', () => {
  beforeEach(() => cognitoMock.reset());
  afterEach(() => cognitoMock.reset());

  it('returns fresh Id + Access tokens on a successful REFRESH_TOKEN_AUTH', async () => {
    cognitoMock.on(InitiateAuthCommand).resolves({
      AuthenticationResult: { IdToken: 'new-id', AccessToken: 'new-access' },
    });

    const tokens = await refreshTokens('valid-refresh');
    expect(tokens).toEqual({ IdToken: 'new-id', AccessToken: 'new-access', RefreshToken: undefined });

    // Sent as a REFRESH_TOKEN_AUTH flow with the token in AuthParameters.
    const call = cognitoMock.commandCalls(InitiateAuthCommand)[0];
    expect(call.args[0].input).toMatchObject({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: { REFRESH_TOKEN: 'valid-refresh' },
    });
  });

  it('rejects when Cognito returns no AuthenticationResult', async () => {
    cognitoMock.on(InitiateAuthCommand).resolves({});
    await expect(refreshTokens('x')).rejects.toThrow('Refresh failed: no tokens returned');
  });

  it('rejects when the refresh token is expired/revoked (Cognito throws)', async () => {
    cognitoMock.on(InitiateAuthCommand).rejects(new Error('NotAuthorizedException'));
    await expect(refreshTokens('expired')).rejects.toThrow('NotAuthorizedException');
  });
});
