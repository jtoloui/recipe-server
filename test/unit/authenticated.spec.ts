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

const authedReq = () =>
  ({
    session: { user: { username: 'jamie', sub: 'u1', tokens: { IdToken: 'id.token' } } },
    cookies: { app_session: 'present' },
  }) as unknown as Request;

describe('isAuthenticated (A4 middleware wiring)', () => {
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

  it('calls next() when the verifier accepts the ID token', async () => {
    verifyIdTokenMock.mockResolvedValueOnce({ sub: 'u1', token_use: 'id' });
    const { isAuthenticated } = await import('@/middleware/authenticated');
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;
    await isAuthenticated(authedReq(), res, next);
    expect(verifyIdTokenMock).toHaveBeenCalledWith('id.token');
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
  });

  it('401s when the verifier rejects the token', async () => {
    verifyIdTokenMock.mockRejectedValueOnce(new Error('expired'));
    const { isAuthenticated } = await import('@/middleware/authenticated');
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;
    await isAuthenticated(authedReq(), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
