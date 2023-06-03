import axios from 'axios';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import jwksClient from 'jwks-rsa';
import { authenticationClient } from '../auth/auth0Client';

import NodeCache from 'node-cache';

const cache = new NodeCache();

const verifyJWT = async (token: string): Promise<any> => {
  try {
    // Fetch the Auth0 JWKS (JSON Web Key Set) endpoint
    const domain = 'toloui-eu.eu.auth0.com';
    const jwksUrl = `https://${domain}/.well-known/jwks.json`;
    const jwksResponse = await axios.get(jwksUrl);
    const jwks = jwksResponse.data.keys;

    // Find the matching key based on the JWT's `kid` header
    const decodedToken: any = jwt.decode(token, { complete: true });

    const { kid } = decodedToken.header;
    const matchingKey = jwks.find((key: any) => key.kid === kid);

    if (!matchingKey) {
      throw new Error('Invalid JWT');
    }

    // Verify the JWT token using the public key
    const publicKey = `-----BEGIN CERTIFICATE-----\n${matchingKey.x5c[0]}\n-----END CERTIFICATE-----`;
    const verifiedToken = jwt.verify(token, publicKey);

    // Return the verified token
    return verifiedToken;
  } catch (error) {
    console.error('JWT verification failed:', error);
    throw error;
  }
};

// Example usage

const authenticateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.cookies.jwt; // Assuming the JWT is stored in a cookie named 'jwt'

    // Check if the user profile is already cached
    const cachedProfile = cache.get(token);

    if (cachedProfile) {
      console.log('cached');

      // If the user profile is found in the cache, attach it to the request object
      req.user = cachedProfile;
      return next();
    }

    // If the user profile is not cached, retrieve it from the Auth0 Management API
    const profile = await authenticationClient.getProfile(token);

    console.log('not cached');

    // Cache the user profile with a TTL (time-to-live) of your choice
    cache.set(token, profile, 3600); // Cache for 1 hour (3600 seconds)

    // Attach the user profile to the request object
    req.user = profile;

    // Proceed to the next middleware
    next();
  } catch (error) {
    console.error('Error retrieving user profile:', error);
    return res.status(401).json({ message: 'Unauthorized' });
  }
};

const attachUserIfAuthenticated = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.cookies.jwt; // Assuming the JWT is stored in a cookie named 'jwt'
    if (!token) {
      return next();
    }

    // Check if the user profile is already cached
    const cachedProfile = cache.get(token);

    if (cachedProfile) {
      console.log('cached');

      // If the user profile is found in the cache, attach it to the request object
      req.user = cachedProfile;
      return next();
    }

    // If the user profile is not cached, retrieve it from the Auth0 Management API
    const profile = await authenticationClient.getProfile(token);

    console.log('not cached');

    // Cache the user profile with a TTL (time-to-live) of your choice
    cache.set(token, profile, 3600); // Cache for 1 hour (3600 seconds)

    // Attach the user profile to the request object
    req.user = profile;

    // Proceed to the next middleware
    next();
  } catch (error) {
    console.error('Error retrieving user profile:', error);
    return res.status(401).json({ message: 'Unauthorized' });
  }
};

export default attachUserIfAuthenticated;
