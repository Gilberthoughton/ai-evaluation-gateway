import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, type DbHandle } from '../../src/infrastructure/db/client.js';
import { users } from '../../src/infrastructure/db/schema/index.js';

describe('database (migrated schema + client)', () => {
  let handle: DbHandle;

  beforeAll(() => {
    handle = createDb(inject('databaseUrl'));
  });

  afterAll(async () => {
    await handle.close();
  });

  it('ping succeeds against the migrated database', async () => {
    await expect(handle.ping()).resolves.toBeUndefined();
  });

  it('inserts and reads back a user (schema applied by migration)', async () => {
    const email = `user-${crypto.randomUUID()}@example.com`;
    const [created] = await handle.db
      .insert(users)
      .values({ email, passwordHash: 'hash', role: 'ADMIN' })
      .returning();

    expect(created?.id).toBeTruthy();
    expect(created?.status).toBe('ACTIVE');

    const found = await handle.db.select().from(users).where(eq(users.email, email));
    expect(found).toHaveLength(1);
    expect(found[0]?.role).toBe('ADMIN');
  });

  it('enforces the unique email constraint', async () => {
    const email = `dupe-${crypto.randomUUID()}@example.com`;
    await handle.db.insert(users).values({ email, passwordHash: 'h', role: 'REVIEWER' });
    await expect(
      handle.db.insert(users).values({ email, passwordHash: 'h', role: 'REVIEWER' }),
    ).rejects.toThrow();
  });
});
