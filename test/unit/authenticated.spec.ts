import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the cached verifier so the middleware test is hermetic.
const verifyIdTokenMock = vi.fn();
vi.mock('@/auth/verifier', () => ({
  verifyIdToken: (t: string) => verifyIdTokenMock(t),
}));

function mockRes() {
  const res = {} as Response & { statusCode?: number; body?: unknown };
  res.status = vi.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn().mockImplementation((b: unknown) => {
    res.body = b;
    return res;
  });
  return res;
}

// A request whose app_session cookie matches the session's stored AccessToken.
const authedReq = (cookie = 'access-abc') =>
  ({
    session: { user: { username: 'jamie', sub: 'u1', tokens: { IdToken: 'id.token', AccessToken: 'access-abc' } } },
    cookies: { app_session: cookie },
  }) as unknown as Request;

describe('isAuthenticated (A4 verifier + A5 app_session validation)', () => {
  beforeEach(() => verifyIdTokenMock.mockReset());

  it('401s when session/cookie are missing (no token provided)', async () => {
    const { isAuthenticated } = await import('@/middleware/authenticated');
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;
    await isAuthenticated({ session: {}, cookies: {} } as unknown as Request, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(verifyIdTokenMock).not.toHaveBeenCalled();
  });

  it('A5: 401s when app_session is present but does NOT match the session token', async () => {
    const { isAuthenticated } = await import('@/middleware/authenticated');
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;
    await isAuthenticated(authedReq('some-other-non-empty-value'), res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ message: 'Forbidden: Invalid session' });
    expect(next).not.toHaveBeenCalled();
    // Verifier must not even be reached when the cookie doesn't match.
    expect(verifyIdTokenMock).not.toHaveBeenCalled();
  });

  it('calls next() when app_session matches AND the verifier accepts the ID token', async () => {
    verifyIdTokenMock.mockResolvedValueOnce({ sub: 'u1', token_use: 'id' });
    const { isAuthenticated } = await import('@/middleware/authenticated');
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;
    await isAuthenticated(authedReq('access-abc'), res, next);
    expect(verifyIdTokenMock).toHaveBeenCalledWith('id.token');
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
  });

  it('401s when the verifier rejects the token (cookie matches)', async () => {
    verifyIdTokenMock.mockRejectedValueOnce(new Error('expired'));
    const { isAuthenticated } = await import('@/middleware/authenticated');
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;
    await isAuthenticated(authedReq('access-abc'), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
