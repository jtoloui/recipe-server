// import { Request } from 'express';
import { RequestContext } from 'express-openid-connect';

interface UserRequestContext extends RequestContext {
  user?: {
    sub: string;
    name: string;
    nickname: string;
    picture: string;
    updated_at: string;
    email: string;
    email_verified: boolean;
    sid: string;
    'http://toloui-recipe.com/country': string;
    'http://toloui-recipe.com/roles': string[];
    'http://toloui-recipe.com/time-zone': string;
  };
}

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
    oidc: UserRequestContext;
    session_token: {
      access_token: string;
      scope: string;
      expires_in: number;
      token_type: string;
      userProfile: {
        sub: string;
        name: string;
        nickname: string;
        picture: string;
        updated_at: string;
        email: string;
        email_verified: boolean;
        'http://toloui-recipe.com/country': string;
        'http://toloui-recipe.com/roles': string[];
        'http://toloui-recipe.com/time-zone': string;
      };
    };
  }
}

declare module 'express-session' {
  interface Session {
    user?: {
      username: string;
      sub: string;
      tokens: {
        AccessToken: string;
        IdToken: string;
        RefreshToken: string;
      };
      userGroups: string[] | undefined;
    };
    state: string;
    nonce: string;
  }
}
