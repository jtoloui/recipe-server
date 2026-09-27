import type { Request, Response } from 'express';
import type { Logger } from 'winston';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/auth/awsCognito', () => ({
  poolData: { UserPoolId: 'pool', ClientId: 'client' },
  userPool: {},
}));

const mockResponse = () => {
  const res = {} as Response & { statusCode?: number; body?: unknown };
  res.status = vi.fn().mockImplementation((status: number) => {
    res.statusCode = status;
    return res;
  });
  res.json = vi.fn().mockImplementation((body: unknown) => {
    res.body = body;
    return res;
  });
  res.clearCookie = vi.fn().mockReturnValue(res) as unknown as Response['clearCookie'];
  res.cookie = vi.fn().mockReturnValue(res) as unknown as Response['cookie'];
  return res;
};

describe('AuthController.isAuthenticated stale-session handling', () => {
  beforeEach(() => {
    vi.stubEnv('COOKIE_DOMAIN', 'justcook.ing');
  });

  it('clears cookies and returns 200 false when a malformed session cannot be destroyed', async () => {
    const { AuthController } = await import('@/controllers/authController');
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;
    const controller = new AuthController({
      logger,
      accessKeyId: '',
      secretAccessKey: '',
      cognitoRegion: 'eu-west-2',
    });
    let finishDestroy: ((error?: Error) => void) | undefined;
    const destroy = vi.fn((callback: (error?: Error) => void) => {
      finishDestroy = callback;
    });
    const req = {
      cookies: { app_session: 'stale-access-token' },
      session: {
        user: {
          username: 'jamie',
          tokens: { IdToken: 'not-a-jwt' },
        },
        destroy,
      },
    } as unknown as Request;
    const res = mockResponse();

    const responsePromise = controller.isAuthenticated(req, res);
    await Promise.resolve();

    expect(destroy).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();

    finishDestroy?.(new Error('session store unavailable'));
    await responsePromise;

    expect(logger.error).toHaveBeenCalledWith('Error destroying session:', expect.any(Error));
    expect(res.clearCookie).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ isAuthenticated: false });
  });

  it('waits for social-session destruction before reporting logout success', async () => {
    const { AuthController } = await import('@/controllers/authController');
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;
    const controller = new AuthController({
      logger,
      accessKeyId: '',
      secretAccessKey: '',
      cognitoRegion: 'eu-west-2',
    });
    let finishDestroy: ((error?: Error) => void) | undefined;
    const req = {
      session: {
        user: {
          username: 'jamie',
          tokens: { IdToken: 'id', AccessToken: 'access', RefreshToken: 'refresh' },
          authType: 'social',
        },
        destroy: vi.fn((callback: (error?: Error) => void) => {
          finishDestroy = callback;
        }),
      },
    } as unknown as Request;
    const res = mockResponse();

    const responsePromise = controller.logout(req, res);
    await Promise.resolve();

    expect(res.status).not.toHaveBeenCalled();
    finishDestroy?.();
    await responsePromise;

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ message: 'User logged out' }));
    expect(res.clearCookie).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledTimes(1);
  });

  it('waits for and reports a social-session destruction failure once', async () => {
    const { AuthController } = await import('@/controllers/authController');
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;
    const controller = new AuthController({
      logger,
      accessKeyId: '',
      secretAccessKey: '',
      cognitoRegion: 'eu-west-2',
    });
    let finishDestroy: ((error?: Error) => void) | undefined;
    const req = {
      session: {
        user: {
          username: 'jamie',
          tokens: { IdToken: 'id', AccessToken: 'access', RefreshToken: 'refresh' },
          authType: 'social',
        },
        destroy: vi.fn((callback: (error?: Error) => void) => {
          finishDestroy = callback;
        }),
      },
    } as unknown as Request;
    const res = mockResponse();

    const responsePromise = controller.logout(req, res);
    await Promise.resolve();

    expect(res.status).not.toHaveBeenCalled();
    finishDestroy?.(new Error('session store unavailable'));
    await responsePromise;

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual(expect.objectContaining({ message: 'Error logging out' }));
    expect(res.clearCookie).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledTimes(1);
  });

  it('clears and destroys a malformed logout session before returning 401', async () => {
    const { AuthController } = await import('@/controllers/authController');
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;
    const controller = new AuthController({
      logger,
      accessKeyId: '',
      secretAccessKey: '',
      cognitoRegion: 'eu-west-2',
    });
    let finishDestroy: ((error?: Error) => void) | undefined;
    const req = {
      session: {
        destroy: vi.fn((callback: (error?: Error) => void) => {
          finishDestroy = callback;
        }),
      },
    } as unknown as Request;
    const res = mockResponse();

    const responsePromise = controller.logout(req, res);
    await Promise.resolve();

    expect(res.status).not.toHaveBeenCalled();
    finishDestroy?.();
    await responsePromise;

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual(expect.objectContaining({ message: 'Not logged in' }));
    expect(res.clearCookie).toHaveBeenCalled();
  });

});
