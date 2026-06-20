import { and, eq, isNull } from 'drizzle-orm';
import type { RefreshTokenRepository } from '../../../application/auth/ports.js';
import type { Database } from '../client.js';
import { refreshTokens } from '../schema/index.js';

export function createRefreshTokenRepository(db: Database): RefreshTokenRepository {
  return {
    async create(input) {
      await db.insert(refreshTokens).values({
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      });
    },
    async findActiveByHash(tokenHash) {
      const [row] = await db
        .select()
        .from(refreshTokens)
        .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
        .limit(1);
      return row ? { id: row.id, userId: row.userId, expiresAt: row.expiresAt } : null;
    },
    async revoke(id) {
      await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, id));
    },
  };
}
