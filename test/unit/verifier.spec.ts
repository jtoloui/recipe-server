import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock aws-jwt-verify so the test is hermetic (no network, no real user pool).
// CognitoJwtVerifier.create() returns an object with a verify() we control.
const verifyMock = vi.fn();
const createMock = vi.fn(() => ({ verify: verifyMock }));
vi.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: { create: createMock },
}));

describe('verifyIdToken (A4 cached verifier)', () => {
  beforeEach(() => {
    verifyMock.mockReset();
  });

  it('creates exactly one cached verifier at module load', async () => {
    // First import of the module triggers the single CognitoJwtVerifier.create().
    await import('@/auth/verifier');
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ tokenUse: 'id' }));
  });

  it('resolves with the decoded payload for a valid token', async () => {
    const payload = { sub: 'user-123', 'cognito:username': 'jamie', token_use: 'id' };
    verifyMock.mockResolvedValueOnce(payload);

    const { verifyIdToken } = await import('@/auth/verifier');
    await expect(verifyIdToken('good.token.here')).resolves.toEqual(payload);
    expect(verifyMock).toHaveBeenCalledWith('good.token.here');
  });

  it('rejects when the token fails verification', async () => {
    verifyMock.mockRejectedValueOnce(new Error('Invalid token'));

    const { verifyIdToken } = await import('@/auth/verifier');
    await expect(verifyIdToken('bad.token')).rejects.toThrow('Invalid token');
  });

  it('reuses the module-level verifier across multiple verify calls', async () => {
    verifyMock.mockResolvedValue({ sub: 'x', token_use: 'id' });
    const { verifyIdToken } = await import('@/auth/verifier');
    await verifyIdToken('a');
    await verifyIdToken('b');
    // The cached instance is reused: create() is never called again (asserted
    // in the first test); here both verifications go through the one verify().
    expect(verifyMock).toHaveBeenCalledTimes(2);
  });
});
