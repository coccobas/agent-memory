/**
 * Edge case tests for Agent Memory
 * Tests scenarios like expired locks, large result sets, and boundary conditions
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  schema,
  createTestProject,
  createTestOrg,
  createTestQueryDeps,
} from '../fixtures/test-helpers.js';

const TEST_DB_PATH = './data/test-edge-cases.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let testOrgId: string;
let testProjectId: string;

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

import { fileLockRepo } from '../../src/db/repositories/file_locks.js';
import { toolRepo } from '../../src/db/repositories/tools.js';
import { type MemoryQueryResult } from '../../src/services/query.service.js';
import { executeQueryPipeline } from '../../src/services/query/index.js';

// Helper to execute query with pipeline (replaces legacy executeMemoryQuery)
async function executeMemoryQuery(params: Parameters<typeof executeQueryPipeline>[0]): Promise<MemoryQueryResult> {
  return executeQueryPipeline(params, createTestQueryDeps()) as Promise<MemoryQueryResult>;
}

describe('Edge Cases', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;

    const org = createTestOrg(db, 'Edge Case Test Org');
    testOrgId = org.id;
    const project = createTestProject(db, 'Edge Case Test Project', testOrgId);
    testProjectId = project.id;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  beforeEach(() => {
    // Clean up all data before each test
    db.delete(schema.fileLocks).run();
    db.delete(schema.toolVersions).run();
    db.delete(schema.tools).run();
  });

  describe('Expired File Locks', () => {
    it('should automatically clean up expired locks on checkout', () => {
      // Create a lock that expired 10 seconds ago
      const pastTime = new Date(Date.now() - 10000).toISOString();
      const expiredTime = new Date(Date.now() - 5000).toISOString();

      db.insert(schema.fileLocks)
        .values({
          id: 'lock-expired',
          filePath: '/path/to/expired.ts',
          checkedOutBy: 'agent-old',
          checkedOutAt: pastTime,
          expiresAt: expiredTime,
        })
        .run();

      // Verify lock exists initially
      const lockBefore = db
        .select()
        .from(schema.fileLocks)
        .where(schema.fileLocks.filePath === '/path/to/expired.ts')
        .get();
      expect(lockBefore).toBeDefined();
      expect(lockBefore?.id).toBe('lock-expired');

      // Try to checkout the same file with a new agent
      const newLock = fileLockRepo.checkout('/path/to/expired.ts', 'agent-new', {
        expiresIn: 60,
      });

      expect(newLock).toBeDefined();
      expect(newLock.checkedOutBy).toBe('agent-new');

      // Old lock should be gone, new lock should exist
      const afterLocks = db
        .select()
        .from(schema.fileLocks)
        .where(schema.fileLocks.filePath === '/path/to/expired.ts')
        .all();
      expect(afterLocks).toHaveLength(1);
      expect(afterLocks[0]?.id).not.toBe('lock-expired');
      expect(afterLocks[0]?.checkedOutBy).toBe('agent-new');
    });

    it('should not return expired locks in getLock', () => {
      const pastTime = new Date(Date.now() - 10000).toISOString();
      const expiredTime = new Date(Date.now() - 1000).toISOString();

      db.insert(schema.fileLocks)
        .values({
          id: 'lock-expired-2',
          filePath: '/path/to/expired2.ts',
          checkedOutBy: 'agent-old',
          checkedOutAt: pastTime,
          expiresAt: expiredTime,
        })
        .run();

      const lock = fileLockRepo.getLock('/path/to/expired2.ts');
      expect(lock).toBeNull();
    });

    it('should filter out expired locks in listLocks', () => {
      const now = Date.now();
      const pastTime = new Date(now - 10000).toISOString();

      // Create one expired and one active lock
      db.insert(schema.fileLocks)
        .values([
          {
            id: 'lock-expired-3',
            filePath: '/path/to/expired3.ts',
            checkedOutBy: 'agent-old',
            checkedOutAt: pastTime,
            expiresAt: new Date(now - 1000).toISOString(), // expired
          },
          {
            id: 'lock-active',
            filePath: '/path/to/active.ts',
            checkedOutBy: 'agent-new',
            checkedOutAt: new Date(now).toISOString(),
            expiresAt: new Date(now + 60000).toISOString(), // expires in future
          },
        ])
        .run();

      const locks = fileLockRepo.listLocks();
      expect(locks).toHaveLength(1);
      expect(locks[0]?.id).toBe('lock-active');
    });

    it('should handle locks without expiration', () => {
      const lock = fileLockRepo.checkout('/path/to/noexpire.ts', 'agent-1', {
        expiresIn: 0, // no expiration
      });

      expect(lock.expiresAt).toBeNull();

      // Should still be retrievable
      const retrieved = fileLockRepo.getLock('/path/to/noexpire.ts');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(lock.id);
    });

    it('should cleanup multiple expired locks at once', () => {
      const now = Date.now();
      const expiredTime = new Date(now - 1000).toISOString();

      // Create 10 expired locks
      const locks = Array.from({ length: 10 }, (_, i) => ({
        id: `lock-expired-${i}`,
        filePath: `/path/to/file${i}.ts`,
        checkedOutBy: 'agent-old',
        checkedOutAt: new Date(now - 10000).toISOString(),
        expiresAt: expiredTime,
      }));

      db.insert(schema.fileLocks).values(locks).run();

      const cleaned = fileLockRepo.cleanupExpiredLocks();
      expect(cleaned).toBe(10);

      // Verify all are gone
      const remaining = db.select().from(schema.fileLocks).all();
      expect(remaining).toHaveLength(0);
    });
  });

  describe('Large Result Sets', () => {
    it('should handle querying 200 tools efficiently', async () => {
      // Create 200 tools in global scope
      const tools = Array.from({ length: 200 }, (_, i) => {
        const tool = toolRepo.create({
          scopeType: 'global',
          name: `tool_${i.toString().padStart(3, '0')}`,
          category: i % 2 === 0 ? 'mcp' : 'cli',
          description: `Test tool number ${i}`,
        });
        return tool;
      });

      expect(tools).toHaveLength(200);

      // Query with default limit (20)
      const result1 = await executeMemoryQuery({
        types: ['tools'],
        scope: { type: 'global' },
      });

      expect(result1.results.length).toBeLessThanOrEqual(20);
      expect(result1.meta.totalCount).toBeGreaterThanOrEqual(result1.results.length);

      // Query with limit of 100
      const result2 = await executeMemoryQuery({
        types: ['tools'],
        scope: { type: 'global' },
        limit: 100,
      });

      expect(result2.results.length).toBeLessThanOrEqual(100);

      // Query with compact mode to reduce memory
      const result3 = await executeMemoryQuery({
        types: ['tools'],
        scope: { type: 'global' },
        limit: 50,
        compact: true,
      });

      expect(result3.results.length).toBeLessThanOrEqual(50);
      // Verify results have expected structure
      if (result3.results.length > 0) {
        expect(result3.results[0]).toHaveProperty('type');
        expect(result3.results[0]).toHaveProperty('id');
      }
    });

    it('should handle pagination with large datasets', () => {
      // Create 50 tools
      Array.from({ length: 50 }, (_, i) => {
        toolRepo.create({
          scopeType: 'global',
          name: `paginated_tool_${i.toString().padStart(3, '0')}`,
          category: 'function',
          description: `Paginated tool ${i}`,
        });
      });

      // List with default pagination
      const page1 = toolRepo.list({ scopeType: 'global' }, { limit: 20, offset: 0 });
      expect(page1).toHaveLength(20);

      const page2 = toolRepo.list({ scopeType: 'global' }, { limit: 20, offset: 20 });
      expect(page2).toHaveLength(20);

      const page3 = toolRepo.list({ scopeType: 'global' }, { limit: 20, offset: 40 });
      expect(page3.length).toBeGreaterThan(0);
      expect(page3.length).toBeLessThanOrEqual(20);
    });

    it('should respect max limit of 100', () => {
      // Create 150 tools
      Array.from({ length: 150 }, (_, i) => {
        toolRepo.create({
          scopeType: 'global',
          name: `limit_test_tool_${i.toString().padStart(3, '0')}`,
          category: 'api',
        });
      });

      // Try to query with limit > 100
      const result = toolRepo.list({ scopeType: 'global' }, { limit: 200 });

      // Should be capped at 100
      expect(result.length).toBeLessThanOrEqual(100);
    });
  });

  describe('File Path Operations', () => {
    it('should accept relative paths at repo level', () => {
      // Repository doesn't validate paths    it('should accept relative paths at repo level', () => {
      const lock = fileLockRepo.checkout('relative/path/file.ts', 'agent-1');
      expect(lock).toBeDefined();
      // Path normalization converts relative to absolute
      expect(lock.filePath).toContain('relative/path/file.ts');
      expect(lock.filePath).toMatch(/.*relative\/path\/file\.ts$/);
    });

    it('should accept paths with .. at repo level', () => {
      // Repository doesn't validate paths - that's done at handler level
      // Handler validation    it('should accept paths with .. at repo level', () => {
      const lock = fileLockRepo.checkout('/path/../file.ts', 'agent-1');
      expect(lock).toBeDefined();
      // Path normalization resolves .. segments
      expect(lock.filePath).toBe('/file.ts');
    });

    it('should accept valid absolute paths', () => {
      const lock = fileLockRepo.checkout('/absolute/path/to/file.ts', 'agent-1');
      expect(lock).toBeDefined();
      expect(lock.filePath).toBe('/absolute/path/to/file.ts');
    });
  });

  describe('Boundary Conditions', () => {
    it('should handle empty query results gracefully', async () => {
      const result = await executeMemoryQuery({
        types: ['tools'],
        scope: { type: 'global' },
        search: 'nonexistent_tool_xyz_123',
      });

      expect(result.results).toHaveLength(0);
      expect(result.meta.totalCount).toBe(0);
      expect(result.meta.truncated).toBe(false);
    });

    it('should handle very long tool names', () => {
      const longName = 'a'.repeat(500);
      const tool = toolRepo.create({
        scopeType: 'global',
        name: longName,
        description: 'Tool with very long name',
      });

      expect(tool).toBeDefined();
      expect(tool.name).toBe(longName);

      const retrieved = toolRepo.getByName(longName, 'global');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe(longName);
    });

    it('should handle tools with minimal data', () => {
      const tool = toolRepo.create({
        scopeType: 'global',
        name: 'minimal_tool',
        // Only required fields
      });

      expect(tool).toBeDefined();
      expect(tool.name).toBe('minimal_tool');
      // Description can be null or undefined when not provided
      expect(tool.currentVersion?.description).toBeFalsy();
    });

    it('should handle maximum lock timeout', () => {
      const MAX_TIMEOUT = 86400; // 24 hours in seconds

      const lock = fileLockRepo.checkout('/path/to/longlock.ts', 'agent-1', {
        expiresIn: MAX_TIMEOUT,
      });

      expect(lock).toBeDefined();

      const expiresAt = new Date(lock.expiresAt!);
      const now = new Date();
      const diffSeconds = (expiresAt.getTime() - now.getTime()) / 1000;

      expect(diffSeconds).toBeGreaterThan(MAX_TIMEOUT - 10); // Allow small variance
      expect(diffSeconds).toBeLessThanOrEqual(MAX_TIMEOUT);
    });

    it('should reject lock timeout exceeding maximum', () => {
      const OVER_MAX = 86401; // 24 hours + 1 second

      expect(() => {
        fileLockRepo.checkout('/path/to/file.ts', 'agent-1', {
          expiresIn: OVER_MAX,
        });
      }).toThrow(/exceed/);
    });
  });
});
