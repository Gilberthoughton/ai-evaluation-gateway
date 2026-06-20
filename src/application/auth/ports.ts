import type { Role } from '../../domain/roles.js';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  status: string;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(input: { email: string; passwordHash: string; role: Role }): Promise<UserRecord>;
  list(): Promise<UserRecord[]>;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  expiresAt: Date;
}

export interface RefreshTokenRepository {
  create(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  findActiveByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revoke(id: string): Promise<void>;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}

export interface AccessTokenIssuer {
  sign(payload: { sub: string; role: Role }): string;
}

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
