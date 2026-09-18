import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyIdTokenMock = vi.fn();
const refreshTokensMock = vi.fn();
vi.mock('@/auth/verifier', () => ({ verifyIdToken: (t: string) => verifyIdTokenMock(t) }));
vi.mock('@/auth/refresh', () => ({ refreshTokens: (t: string) => refreshTokensMock(t) }));

function mockRes() {
  const res = {} as Response & { statusCode?: number; body?: unknown; cookies: Record<string, string> };
  res.cookies = {};
  res.status = vi.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn().mockImplementation((b: unknown) => {
    res.body = b;
    return res;
  });
  res.cookie = vi.fn().mockImplementation((name: string, val: string) => {
    res.cookies[name] = val;
    return res;
  }) as unknown as Response['cookie'];
  return res;
}

const authedReq = () =>
  ({
    session: {
      user: {
        username: 'jamie',
        sub: 'u1',
        tokens: { IdToken: 'id.token', AccessToken: 'access-abc', RefreshToken: 'refresh-xyz' },
      },
    },
    cookies: { app_session: 'access-abc' },
  }) as unknown as Request;

describe('isAuthenticated (A4/A5/A6)', () => {
  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    refreshTokensMock.mockReset();
  });

  it('calls next() when the id token is valid (no refresh)', async () => {
    verifyIdTokenMock.mockResolvedValueOnce({ sub: 'u1' });
    const { isAuthenticated } = await import('@/middleware/authenticated');
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;
    await isAuthenticated(authedReq(), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(refreshTokensMock).not.toHaveBeenCalled();
  });

  it('A6: refreshes on an EXPIRED token, updates session + cookie, then next()', async () => {
    verifyIdTokenMock
      .mockRejectedValueOnce(new Error('Token expired')) // initial verify fails (expired)
      .mockResolvedValueOnce({ sub: 'u1' }); // re-verify of the refreshed token passes
    refreshTokensMock.mockResolvedValueOnce({ IdToken: 'new-id', AccessToken: 'new-access' });

    const { isAuthenticated } = await import('@/middleware/authenticated');
    const req = authedReq();
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;
    await isAuthenticated(req, res, next);

    expect(refreshTokensMock).toHaveBeenCalledWith('refresh-xyz');
    expect(next).toHaveBeenCalledOnce();
    // session updated + app_session cookie re-issued to the new access token
    expect(req.session.user?.tokens.IdToken).toBe('new-id');
    expect(req.session.user?.tokens.AccessToken).toBe('new-access');
    expect(res.cookies.app_session).toBe('new-access');
  });

  it('A6: does NOT refresh on a non-expiry verify failure (bad signature) -> 401', async () => {
    verifyIdTokenMock.mockRejectedValueOnce(new Error('Invalid signature'));
    const { isAuthenticated } = await import('@/middleware/authenticated');
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;
    await isAuthenticated(authedReq(), res, next);
    expect(res.statusCode).toBe(401);
    expect(refreshTokensMock).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('A6: 401 Session expired when refresh itself fails', async () => {
    verifyIdTokenMock.mockRejectedValueOnce(new Error('Token expired'));
    refreshTokensMock.mockRejectedValueOnce(new Error('NotAuthorizedException'));
    const { isAuthenticated } = await import('@/middleware/authenticated');
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;
    await isAuthenticated(authedReq(), res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ message: 'Forbidden: Session expired' });
    expect(next).not.toHaveBeenCalled();
  });

  it('A5: present-but-mismatched app_session -> 401, no verify/refresh', async () => {
    const { isAuthenticated } = await import('@/middleware/authenticated');
    const req = authedReq();
    (req as unknown as { cookies: Record<string, string> }).cookies.app_session = 'wrong';
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;
    await isAuthenticated(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(verifyIdTokenMock).not.toHaveBeenCalled();
    expect(refreshTokensMock).not.toHaveBeenCalled();
  });
});
