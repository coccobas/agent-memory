import { beforeAll, afterAll } from 'vitest';
import { closeDb } from '../../src/db/connection.js';
import { cleanupDbFiles, ensureDataDirectory } from './db-utils.js';

const TEST_DB_PATH = './data/test-memory.db';

// Ensure data directory exists
ensureDataDirectory();

beforeAll(() => {
  // Clean up any existing test database
  cleanupDbFiles(TEST_DB_PATH);
});

afterAll(() => {
  closeDb();

  // Clean up test database
  cleanupDbFiles(TEST_DB_PATH);
});
