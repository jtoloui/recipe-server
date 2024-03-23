export type User = {
  username: string;
  sub: string;
  givenName: string;
  familyName: string;
  name: string;
  email: string;
  tokens: {
    AccessToken: string;
    IdToken: string;
    RefreshToken: string;
  };
  userGroups: string[] | undefined;
  authType?: string;
  provider?: {
    userId: string;
    providerType: string;
  };
};
