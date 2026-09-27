import type { CookieOptions, Request, Response } from 'express';

export const APP_SESSION_COOKIE = 'app_session';
export const EXPRESS_SESSION_COOKIE = 'connect.sid';
export const AUTH_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

const cookieDomain = (): string | undefined => {
  const domain = process.env.COOKIE_DOMAIN?.trim().replace(/^\.+/, '');
  return domain ? `.${domain}` : undefined;
};

export const authCookieOptions = (persistent = true): CookieOptions => {
  const domain = cookieDomain();
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    ...(domain ? { domain } : {}),
    ...(persistent ? { maxAge: AUTH_COOKIE_MAX_AGE_MS } : {}),
  };
};

const clearCookieVariants = (res: Response, name: string): void => {
  const canonicalOptions = authCookieOptions(false);
  res.clearCookie(name, canonicalOptions);

  // Older social-login/refresh paths created host-only cookies. Clear that
  // legacy variant too, otherwise browsers can send two cookies with the same
  // name and cookie-parser may read the stale one.
  if (canonicalOptions.domain) {
    const { domain: _domain, ...hostOnlyOptions } = canonicalOptions;
    res.clearCookie(name, hostOnlyOptions);
  }
};

export const setAppSessionCookie = (res: Response, token: string): Response => {
  clearCookieVariants(res, APP_SESSION_COOKIE);
  return res.cookie(APP_SESSION_COOKIE, token, authCookieOptions(true));
};

export const clearAuthCookies = (res: Response): Response => {
  clearCookieVariants(res, APP_SESSION_COOKIE);
  clearCookieVariants(res, EXPRESS_SESSION_COOKIE);
  return res;
};

export const destroyAuthSession = (req: Request): Promise<Error | null> =>
  new Promise((resolve) => {
    if (!req.session || typeof req.session.destroy !== 'function') {
      resolve(null);
      return;
    }

    try {
      req.session.destroy((error) => {
        if (!error) {
          resolve(null);
          return;
        }
        resolve(error instanceof Error ? error : new Error(String(error)));
      });
    } catch (error) {
      resolve(error instanceof Error ? error : new Error(String(error)));
    }
  });
