import type { Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  APP_SESSION_COOKIE,
  AUTH_COOKIE_MAX_AGE_MS,
  EXPRESS_SESSION_COOKIE,
  authCookieOptions,
  clearAuthCookies,
  setAppSessionCookie,
} from '@/utils/authCookies';

const mockResponse = () => {
  const res = {} as Response;
  res.cookie = vi.fn().mockReturnValue(res) as unknown as Response['cookie'];
  res.clearCookie = vi.fn().mockReturnValue(res) as unknown as Response['clearCookie'];
  return res;
};

describe('auth cookie helpers', () => {
  beforeEach(() => {
    vi.stubEnv('COOKIE_DOMAIN', 'justcook.ing');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses one canonical seven-day cookie configuration', () => {
    expect(authCookieOptions()).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      domain: '.justcook.ing',
      maxAge: AUTH_COOKIE_MAX_AGE_MS,
    });
  });

  it('normalizes a configured leading dot', () => {
    vi.stubEnv('COOKIE_DOMAIN', '.justcook.ing');
    expect(authCookieOptions().domain).toBe('.justcook.ing');
  });

  it('clears domain and legacy host-only variants before setting app_session', () => {
    const res = mockResponse();

    setAppSessionCookie(res, 'new-access-token');

    expect(res.clearCookie).toHaveBeenCalledWith(
      APP_SESSION_COOKIE,
      expect.objectContaining({ domain: '.justcook.ing', path: '/' }),
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      APP_SESSION_COOKIE,
      expect.not.objectContaining({ domain: expect.anything() }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      APP_SESSION_COOKIE,
      'new-access-token',
      expect.objectContaining({
        domain: '.justcook.ing',
        maxAge: AUTH_COOKIE_MAX_AGE_MS,
        sameSite: 'lax',
      }),
    );
  });

  it('clears both app and Express session cookie variants without persistence options', () => {
    const res = mockResponse();

    clearAuthCookies(res);

    for (const name of [APP_SESSION_COOKIE, EXPRESS_SESSION_COOKIE]) {
      expect(res.clearCookie).toHaveBeenCalledWith(
        name,
        expect.objectContaining({ domain: '.justcook.ing', path: '/' }),
      );
    }
    for (const [, options] of vi.mocked(res.clearCookie).mock.calls) {
      expect(options).not.toHaveProperty('maxAge');
    }
  });
});
