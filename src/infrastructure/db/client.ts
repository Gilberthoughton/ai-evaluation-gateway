import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema/index.js';

export type Schema = typeof schema;
export type Database = PostgresJsDatabase<Schema>;

export interface DbHandle {
  db: Database;
  sql: Sql;
  /** Liveness check used by the readiness probe. */
  ping: () => Promise<void>;
  close: () => Promise<void>;
}

/** Creates a connection-pooled Drizzle database handle. */
export function createDb(databaseUrl: string, max = 10): DbHandle {
  const sql = postgres(databaseUrl, { max });
  const db = drizzle(sql, { schema });
  return {
    db,
    sql,
    ping: async () => {
      await sql`select 1`;
    },
    close: () => sql.end(),
  };
}
