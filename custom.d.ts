import { User } from '@/types/common/user';
import express from 'express';
import session from 'express-session';

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
  }
}

declare module 'express-session' {
  interface SessionData {
    user?: User;
    state: string;
    nonce: string;
  }
  interface Session {
    user?: User;
    state: string;
    nonce: string;
  }
}

declare module 'express' {
  interface Request {
    id: string;
    cookies: {
      app_session?: string;
    };
  }
}
