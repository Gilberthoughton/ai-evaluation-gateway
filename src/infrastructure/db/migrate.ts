import { dirname, join } from 'node:path';
import { argv } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { loadConfig } from '../../config/config.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Applies all pending migrations against the given database, then closes the connection. */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder });
  } finally {
    await sql.end();
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  await runMigrations(config.DATABASE_URL);
}

// Run only when invoked directly (the `db:migrate` script), not when imported by tests.
if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
