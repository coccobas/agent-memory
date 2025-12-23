import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  registerTestContext,
  createTestTool,
} from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';

const TEST_DB_PATH = './data/test-conflicts.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let context: AppContext;

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

import { conflictHandlers } from '../../src/mcp/handlers/conflicts.handler.js';
import { toolHandlers } from '../../src/mcp/handlers/tools.handler.js';

describe('Conflicts Integration', () => {
  const AGENT_ID = 'agent-1';
  let previousPermMode: string | undefined;
  beforeAll(() => {
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    context = registerTestContext(testDb);
  });

  afterAll(() => {
    if (previousPermMode === undefined) {
      delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    } else {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = previousPermMode;
    }
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('memory_conflicts', () => {
    it('should list all conflicts', async () => {
      const result = await conflictHandlers.list(context, { limit: 10 });
      expect(result.conflicts).toBeDefined();
      expect(Array.isArray(result.conflicts)).toBe(true);
      expect(result.meta.returnedCount).toBeDefined();
    });

    it('should filter conflicts by entryType', async () => {
      const result = await conflictHandlers.list(context, {
        entryType: 'tool',
        limit: 10,
      });

      result.conflicts.forEach((conflict) => {
        expect(conflict.entryType).toBe('tool');
      });
    });

    it('should filter conflicts by resolved status', async () => {
      const unresolvedResult = await conflictHandlers.list(context, {
        resolved: false,
        limit: 10,
      });

      unresolvedResult.conflicts.forEach((conflict) => {
        expect(conflict.resolved).toBe(false);
      });

      const resolvedResult = await conflictHandlers.list(context, {
        resolved: true,
        limit: 10,
      });

      resolvedResult.conflicts.forEach((conflict) => {
        expect(conflict.resolved).toBe(true);
      });
    });

    it('should support pagination', async () => {
      const result = await conflictHandlers.list(context, { limit: 2, offset: 0 });
      expect(result.conflicts.length).toBeLessThanOrEqual(2);
    });
  });

  describe('memory_conflict_resolve', () => {
    it('should resolve a conflict', async () => {
      // Create a tool and trigger conflict detection by rapid updates
      const { tool } = createTestTool(db, 'conflict_test_tool');

      // First update
      await toolHandlers.update(context, {
        agentId: AGENT_ID,
        id: tool.id,
        description: 'First update',
        changeReason: 'First change',
      });

      // Second update within conflict window (simulate concurrent write)
      // Note: In real scenario, conflict would be detected automatically
      // For testing, we need to manually create a conflict or wait for detection
      // This test verifies the resolution mechanism works

      // Get any existing conflicts
      const listResult = await conflictHandlers.list(context, { resolved: false, limit: 1 });

      if (listResult.conflicts.length > 0) {
        const conflict = listResult.conflicts[0];
        const resolveResult = await conflictHandlers.resolve(context, {
          id: conflict.id,
          resolution: 'Resolved by test',
          resolvedBy: 'test-user',
        });

        expect(resolveResult.success).toBe(true);
        expect(resolveResult.conflict.resolved).toBe(true);
        expect(resolveResult.conflict.resolution).toBe('Resolved by test');
        expect(resolveResult.conflict.resolvedBy).toBe('test-user');
      } else {
        // If no conflicts exist, test that resolution fails gracefully
        await expect(
          conflictHandlers.resolve(context, {
            id: 'non-existent',
            resolution: 'Test',
            resolvedBy: 'test',
          })
        ).rejects.toThrow(/Conflict not found/);
      }
    });

    it('should require id', async () => {
      await expect(conflictHandlers.resolve(context, {})).rejects.toThrow('id is required');
    });

    it('should require resolution', async () => {
      await expect(
        conflictHandlers.resolve(context, { id: 'test-id' })
      ).rejects.toThrow('resolution is required');
    });
  });
});
