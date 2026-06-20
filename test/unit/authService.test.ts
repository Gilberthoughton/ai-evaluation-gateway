import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../../src/application/auth/authService.js';
import type {
  AccessTokenIssuer,
  Clock,
  PasswordHasher,
  RefreshTokenRecord,
  RefreshTokenRepository,
  UserRecord,
  UserRepository,
} from '../../src/application/auth/ports.js';
import { UnauthenticatedError } from '../../src/domain/errors.js';

class FakeUserRepository implements UserRepository {
  private readonly byId = new Map<string, UserRecord>();
  add(user: UserRecord): void {
    this.byId.set(user.id, user);
  }
  findByEmail(email: string): Promise<UserRecord | null> {
    return Promise.resolve([...this.byId.values()].find((u) => u.email === email) ?? null);
  }
  findById(id: string): Promise<UserRecord | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }
  create(): Promise<UserRecord> {
    throw new Error('not used');
  }
  list(): Promise<UserRecord[]> {
    return Promise.resolve([...this.byId.values()]);
  }
}

class FakeRefreshRepository implements RefreshTokenRepository {
  rows: { id: string; userId: string; tokenHash: string; expiresAt: Date; revoked: boolean }[] = [];
  private seq = 0;
  create(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void> {
    this.rows.push({ id: `r${++this.seq}`, ...input, revoked: false });
    return Promise.resolve();
  }
  findActiveByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const row = this.rows.find((r) => r.tokenHash === tokenHash && !r.revoked);
    return Promise.resolve(row ? { id: row.id, userId: row.userId, expiresAt: row.expiresAt } : null);
  }
  revoke(id: string): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) row.revoked = true;
    return Promise.resolve();
  }
}

const hasher: PasswordHasher = {
  hash: (plain) => Promise.resolve(`hashed:${plain}`),
  verify: (hash, plain) => Promise.resolve(hash === `hashed:${plain}`),
};
const issuer: AccessTokenIssuer = { sign: (p) => `access:${p.sub}:${p.role}` };
const clock: Clock = { now: () => new Date('2026-06-19T00:00:00Z') };

function makeService(users: FakeUserRepository, refresh: FakeRefreshRepository): AuthService {
  return new AuthService(users, refresh, hasher, issuer, clock, {
    refreshSecret: 'test-secret',
    refreshTtlSeconds: 3600,
  });
}

describe('AuthService', () => {
  let users: FakeUserRepository;
  let refresh: FakeRefreshRepository;
  let service: AuthService;

  beforeEach(() => {
    users = new FakeUserRepository();
    refresh = new FakeRefreshRepository();
    users.add({
      id: 'u1',
      email: 'a@x.com',
      passwordHash: 'hashed:secret123',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    service = makeService(users, refresh);
  });

  it('issues tokens on valid login and stores a refresh token', async () => {
    const tokens = await service.login('a@x.com', 'secret123');
    expect(tokens.accessToken).toBe('access:u1:ADMIN');
    expect(tokens.refreshToken).toBeTruthy();
    expect(refresh.rows).toHaveLength(1);
  });

  it('rejects an incorrect password', async () => {
    await expect(service.login('a@x.com', 'wrong')).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('rejects an unknown email without revealing it', async () => {
    await expect(service.login('nobody@x.com', 'secret123')).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('rotates the refresh token on refresh (old token becomes unusable)', async () => {
    const { refreshToken } = await service.login('a@x.com', 'secret123');
    const rotated = await service.refresh(refreshToken);
    expect(rotated.refreshToken).not.toBe(refreshToken);
    // reusing the now-rotated token must fail
    await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('logout revokes the refresh token', async () => {
    const { refreshToken } = await service.login('a@x.com', 'secret123');
    await service.logout(refreshToken);
    await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});
