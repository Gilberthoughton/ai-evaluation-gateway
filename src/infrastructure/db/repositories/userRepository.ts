import { eq } from 'drizzle-orm';
import type { UserRecord, UserRepository } from '../../../application/auth/ports.js';
import type { Database } from '../client.js';
import { users } from '../schema/index.js';

type UserRow = typeof users.$inferSelect;

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    role: row.role,
    status: row.status,
  };
}

export function createUserRepository(db: Database): UserRepository {
  return {
    async findByEmail(email) {
      const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return row ? toRecord(row) : null;
    },
    async findById(id) {
      const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return row ? toRecord(row) : null;
    },
    async create(input) {
      const [row] = await db
        .insert(users)
        .values({ email: input.email, passwordHash: input.passwordHash, role: input.role })
        .returning();
      if (!row) {
        throw new Error('Failed to create user');
      }
      return toRecord(row);
    },
    async list() {
      const rows = await db.select().from(users).orderBy(users.createdAt);
      return rows.map(toRecord);
    },
  };
}
