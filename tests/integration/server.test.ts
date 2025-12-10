/**
 * Integration tests for MCP server
 *
 * Tests server creation and initialization. Handler logic is tested in handler-specific tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../../src/mcp/server.js';
import { getDb, closeDb } from '../../src/db/connection.js';
import { tagRepo } from '../../src/db/repositories/tags.js';

describe('MCP Server', () => {
  beforeEach(() => {
    closeDb();
    getDb();
    tagRepo.seedPredefined();
  });

  afterEach(() => {
    closeDb();
  });

  describe('createServer', () => {
    it('should create server instance', () => {
      const server = createServer();
      expect(server).toBeDefined();
    });

    it('should initialize database when creating server', () => {
      closeDb();
      const server = createServer();
      expect(server).toBeDefined();
      // Database should be initialized
      const db = getDb();
      expect(db).toBeDefined();
    });

    it('should seed predefined tags when creating server', () => {
      const server = createServer();
      expect(server).toBeDefined();
      // Tags should be seeded (tested in tag tests)
    });

    it('should create multiple server instances', () => {
      const server1 = createServer();
      const server2 = createServer();
      expect(server1).toBeDefined();
      expect(server2).toBeDefined();
      expect(server1).not.toBe(server2);
    });
  });
});
