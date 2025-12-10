import { beforeAll, afterAll, beforeEach } from 'vitest';
import { getDb, closeDb } from '../../src/db/connection.js';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';

const TEST_DB_PATH = './data/test-memory.db';

// Ensure data directory exists
if (!existsSync('./data')) {
  mkdirSync('./data', { recursive: true });
}

beforeAll(() => {
  // Clean up any existing test database
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
  }
  if (existsSync(`${TEST_DB_PATH}-wal`)) {
    unlinkSync(`${TEST_DB_PATH}-wal`);
  }
  if (existsSync(`${TEST_DB_PATH}-shm`)) {
    unlinkSync(`${TEST_DB_PATH}-shm`);
  }
});

afterAll(() => {
  closeDb();

  // Clean up test database
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
  }
  if (existsSync(`${TEST_DB_PATH}-wal`)) {
    unlinkSync(`${TEST_DB_PATH}-wal`);
  }
  if (existsSync(`${TEST_DB_PATH}-shm`)) {
    unlinkSync(`${TEST_DB_PATH}-shm`);
  }
});
