import { NextFunction, Request, Response } from 'express';
import jwt, { Jwt, JwtPayload, type Secret, VerifyOptions } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

import { jwkUri } from '../auth/awsCognito';

const client = jwksClient({
  jwksUri: jwkUri,
});

type Header = {
  kid: string;
};

type GetSigningKeyCallback = (err: Error | null, signingKey: Secret) => void;

function getKey(header: Header, callback: GetSigningKeyCallback): void {
  client.getSigningKey(header.kid, function (err, key) {
    const signingKey =
      (key as jwksClient.CertSigningKey).publicKey ||
      (key as jwksClient.RsaSigningKey).rsaPublicKey;
    callback(err, signingKey);
  });
}

export const isAuthenticated = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let token: string | null = req.session?.user?.tokens.IdToken
    ? req.session.user.tokens.IdToken
    : null;

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }

  const options: VerifyOptions & { complete?: boolean } = {
    algorithms: ['RS256'],
    complete: true,
  };

  // @ts-ignore
  jwt.verify(
    token,
    getKey as unknown as Secret,
    options,
    function (err: Error | null, decoded: Jwt | JwtPayload | string) {
      if (err) {
        return res.status(401).json({ message: 'Unauthorized: Invalid token' });
      }
      next();
    }
  );
};
