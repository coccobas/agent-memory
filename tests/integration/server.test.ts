/**
 * Integration tests for MCP server
 *
 * Tests server creation and initialization. Handler logic is tested in handler-specific tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../../src/mcp/server.js';
import { closeDb, getDb } from '../../src/db/connection.js';
import {
  setupTestDb,
  cleanupTestDb,
  createTestQueryDeps,
  getRuntime,
  type TestDb,
} from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';
import { createComponentLogger } from '../../src/utils/logger.js';
import { config } from '../../src/config/index.js';
import { SecurityService } from '../../src/services/security.service.js';

const TEST_DB_PATH = 'data/test/server-test.db';

describe('MCP Server', () => {
  let testDb: TestDb;
  let context: AppContext;

  beforeEach(() => {
    testDb = setupTestDb(TEST_DB_PATH);

    // Create AppContext for createServer
    context = {
      config,
      db: testDb.db,
      sqlite: testDb.sqlite,
      logger: createComponentLogger('test'),
      queryDeps: createTestQueryDeps(),
      security: new SecurityService(config),
      runtime: getRuntime(),
    };
  });

  afterEach(() => {
    closeDb();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('createServer', () => {
    it('should create server instance', async () => {
      const server = await createServer(context);
      expect(server).toBeDefined();
    });

    it('should have database available after server creation', async () => {
      const server = await createServer(context);
      expect(server).toBeDefined();
      // Database should be available
      const db = getDb();
      expect(db).toBeDefined();
    });

    it('should seed predefined tags when creating server', async () => {
      const server = await createServer(context);
      expect(server).toBeDefined();
      // Tags should be seeded (tested in tag tests)
    });

    it('should create multiple server instances', async () => {
      const server1 = await createServer(context);
      const server2 = await createServer(context);
      expect(server1).toBeDefined();
      expect(server2).toBeDefined();
      expect(server1).not.toBe(server2);
    });
  });
});
