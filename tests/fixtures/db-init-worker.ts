import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../src/db/schema.js';
import { registerDatabase, closeDb } from '../../src/db/connection.js';
import { initializeDatabase } from '../../src/db/init.js';

const dbPath = process.argv[2];
if (!dbPath) {
  // eslint-disable-next-line no-console
  console.error('Missing dbPath argument');
  process.exit(2);
}

try {
  // Create SQLite connection
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  // Create Drizzle instance
  const db = drizzle(sqlite, { schema });

  // Register with container
  registerDatabase(db, sqlite);

  // Initialize database (run migrations)
  initializeDatabase(sqlite, { verbose: false });

  // eslint-disable-next-line no-console
  console.log('ok');
  closeDb();
  process.exit(0);
} catch (e) {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : String(e));
  closeDb();
  process.exit(1);
}
