import { getDb, closeDb } from '../../src/db/connection.js';

const dbPath = process.argv[2];
if (!dbPath) {
  // eslint-disable-next-line no-console
  console.error('Missing dbPath argument');
  process.exit(2);
}

try {
  getDb({ dbPath });
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
