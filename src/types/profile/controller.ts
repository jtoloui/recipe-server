import { errorResponse } from '../common/error';

export type getProfile = {
  name: string;
  email: string;
  id: string;
  nickname: string;
  givenName: string;
  familyName: string;
  userName: string;
};

export type getProfileResponse = getProfile | errorResponse;
