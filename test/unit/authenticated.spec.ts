import { JwtExpiredError } from 'aws-jwt-verify/error';
import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyIdTokenMock = vi.fn();
const refreshTokensMock = vi.fn();
vi.mock('@/auth/verifier', () => ({ verifyIdToken: (t: string) => verifyIdTokenMock(t) }));
vi.mock('@/auth/refresh', () => ({ refreshTokens: (t: string) => refreshTokensMock(t) }));

// A real expired-token error, as aws-jwt-verify actually throws — so the
// middleware's `instanceof JwtExpiredError` check behaves as in production.
const expiredError = () => new JwtExpiredError('Token expired at 2020-01-01T00:00:00.000Z', new Date());

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
  res.clearCookie = vi.fn().mockReturnValue(res) as unknown as Response['clearCookie'];
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
      destroy: vi.fn((callback: (error?: Error) => void) => callback()),
    },
    cookies: { app_session: 'access-abc' },
  }) as unknown as Request;

describe('isAuthenticated (A4/A5/A6)', () => {
  beforeEach(() => {
    vi.stubEnv('COOKIE_DOMAIN', 'justcook.ing');
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
      .mockRejectedValueOnce(expiredError()) // initial verify fails (expired)
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
    expect(res.cookie).toHaveBeenCalledWith(
      'app_session',
      'new-access',
      expect.objectContaining({ domain: '.justcook.ing', maxAge: 1000 * 60 * 60 * 24 * 7 }),
    );
  });

  it('A6: does NOT refresh on a non-expiry verify failure (bad signature) -> 401', async () => {
    verifyIdTokenMock.mockRejectedValueOnce(new Error('Invalid signature'));
    const { isAuthenticated } = await import('@/middleware/authenticated');
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;
    await isAuthenticated(authedReq(), res, next);
    expect(res.statusCode).toBe(401);
    expect(res.clearCookie).toHaveBeenCalled();
    expect(refreshTokensMock).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('A6: 401 Session expired when refresh itself fails', async () => {
    verifyIdTokenMock.mockRejectedValueOnce(expiredError());
    refreshTokensMock.mockRejectedValueOnce(new Error('NotAuthorizedException'));
    const { isAuthenticated } = await import('@/middleware/authenticated');
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;
    await isAuthenticated(authedReq(), res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ message: 'Forbidden: Session expired' });
    expect(res.clearCookie).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('A5: rejects a mismatched app_session only after session destruction completes', async () => {
    const { isAuthenticated } = await import('@/middleware/authenticated');
    const req = authedReq();
    (req as unknown as { cookies: Record<string, string> }).cookies.app_session = 'wrong';
    let finishDestroy: ((error?: Error) => void) | undefined;
    req.session.destroy = vi.fn((callback: (error?: Error) => void) => {
      finishDestroy = callback;
      return req.session;
    });
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    const responsePromise = isAuthenticated(req, res, next);
    await Promise.resolve();

    expect(verifyIdTokenMock).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();

    finishDestroy?.();
    await responsePromise;

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ message: 'Forbidden: Session mismatch' });
    expect(res.clearCookie).toHaveBeenCalled();
  });
});
