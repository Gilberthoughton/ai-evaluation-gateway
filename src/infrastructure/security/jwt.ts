import { createSigner, createVerifier } from 'fast-jwt';
import type { AccessTokenIssuer } from '../../application/auth/ports.js';
import { isRole, type Role } from '../../domain/roles.js';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

export interface AccessTokens {
  issuer: AccessTokenIssuer;
  verify(token: string): AccessTokenPayload;
}

/** Builds an HS256 access-token signer/verifier over a shared secret. */
export function createAccessTokens(secret: string, ttlSeconds: number): AccessTokens {
  const signer = createSigner({ key: secret, expiresIn: ttlSeconds * 1000 });
  const verifier = createVerifier({ key: secret });

  return {
    issuer: {
      sign: (payload) => signer(payload),
    },
    verify: (token) => {
      const decoded = verifier(token) as Record<string, unknown>;
      if (typeof decoded.sub !== 'string' || !isRole(decoded.role)) {
        throw new Error('Malformed access token');
      }
      return { sub: decoded.sub, role: decoded.role };
    },
  };
}
