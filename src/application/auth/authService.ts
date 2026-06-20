import { createHmac, randomBytes } from 'node:crypto';
import { UnauthenticatedError } from '../../domain/errors.js';
import type { Role } from '../../domain/roles.js';
import type {
  AccessTokenIssuer,
  Clock,
  PasswordHasher,
  RefreshTokenRepository,
  UserRepository,
} from './ports.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthServiceConfig {
  refreshSecret: string;
  refreshTtlSeconds: number;
}

/**
 * Authentication use cases. Access is a short-lived JWT; the refresh token is a high-entropy random
 * value stored as an HMAC (revocable, rotated on every use) — so a stolen access token expires
 * quickly and a leaked database cannot forge or reuse a refresh token (ADR 0005).
 */
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly hasher: PasswordHasher,
    private readonly accessTokens: AccessTokenIssuer,
    private readonly clock: Clock,
    private readonly config: AuthServiceConfig,
  ) {}

  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await this.users.findByEmail(email);
    // Verify against the found hash, or a throwaway one, to avoid leaking which emails exist via timing.
    const hash = user?.passwordHash ?? '$argon2id$v=19$m=65536,t=3,p=4$0000000000000000$0000000000000000';
    const ok = await this.hasher.verify(hash, password);
    if (!user || !ok || user.status !== 'ACTIVE') {
      throw new UnauthenticatedError('Invalid credentials');
    }
    return this.issue(user.id, user.role);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const record = await this.refreshTokens.findActiveByHash(this.hashToken(refreshToken));
    if (!record || record.expiresAt.getTime() <= this.clock.now().getTime()) {
      throw new UnauthenticatedError('Invalid or expired refresh token');
    }
    const user = await this.users.findById(record.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthenticatedError('Invalid refresh token');
    }
    await this.refreshTokens.revoke(record.id); // rotation: the presented token is now single-use
    return this.issue(user.id, user.role);
  }

  async logout(refreshToken: string): Promise<void> {
    const record = await this.refreshTokens.findActiveByHash(this.hashToken(refreshToken));
    if (record) {
      await this.refreshTokens.revoke(record.id);
    }
  }

  private async issue(userId: string, role: Role): Promise<AuthTokens> {
    const accessToken = this.accessTokens.sign({ sub: userId, role });
    const refreshToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(this.clock.now().getTime() + this.config.refreshTtlSeconds * 1000);
    await this.refreshTokens.create({ userId, tokenHash: this.hashToken(refreshToken), expiresAt });
    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHmac('sha256', this.config.refreshSecret).update(token).digest('hex');
  }
}
