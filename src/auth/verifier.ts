import { CognitoJwtVerifier } from 'aws-jwt-verify';

import { poolData } from './awsCognito';

/**
 * Cached Cognito JWT verifier (RECON-FINDINGS A4).
 *
 * Replaces the previous per-request pattern in middleware/authenticated.ts:
 * an HTTP JWKS fetch + jwk-to-pem + manual jwt.verify + hand-rolled iss/aud
 * checks on EVERY authenticated request. `aws-jwt-verify` fetches and caches
 * the JWKS once, rotates keys automatically, and validates signature, issuer,
 * audience/client, expiry and token-use in a single call.
 *
 * The verifier is created once at module load and reused across requests.
 */
export const idTokenVerifier = CognitoJwtVerifier.create({
  userPoolId: poolData.UserPoolId,
  clientId: poolData.ClientId,
  tokenUse: 'id',
});

export type VerifiedIdToken = Awaited<ReturnType<typeof idTokenVerifier.verify>>;

/**
 * Verify a Cognito ID token. Resolves with the decoded payload when valid,
 * rejects when the token is missing, malformed, expired, or fails signature /
 * issuer / audience validation. Callers translate a rejection into 401.
 */
export async function verifyIdToken(token: string): Promise<VerifiedIdToken> {
  return idTokenVerifier.verify(token);
}
