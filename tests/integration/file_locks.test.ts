import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { AppContext } from '../../src/core/context.js';
import {
  setupTestDb,
  cleanupTestDb,
  schema,
  createTestProject,
  createTestSession,
  registerTestContext,
} from '../fixtures/test-helpers.js';

const TEST_DB_PATH = './data/test-file-locks-integration.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let context: AppContext;
let testProjectId: string;
let testSessionId: string;

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

import { fileLockHandlers } from '../../src/mcp/handlers/file_locks.handler.js';

describe('File Locks Integration', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    context = registerTestContext(testDb);

    // Create test project and session for FK-constrained tests
    const project = createTestProject(db, 'Integration Lock Test Project');
    testProjectId = project.id;
    const session = createTestSession(db, testProjectId, 'Integration Lock Test Session');
    testSessionId = session.id;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  beforeEach(() => {
    // Clean up all locks before each test
    db.delete(schema.fileLocks).run();
  });

  describe('memory_file_checkout', () => {
    it('should checkout a file successfully', async () => {
      const result = await fileLockHandlers.checkout(context, {
        file_path: '/path/to/file.ts',
        agent_id: 'agent-1',
      });

      expect(result.success).toBe(true);
      expect(result.lock).toBeDefined();
      expect(result.lock.filePath).toBe('/path/to/file.ts');
      expect(result.lock.checkedOutBy).toBe('agent-1');
    });

    it('should require file_path', async () => {
      await expect(
        fileLockHandlers.checkout(context, {
          agent_id: 'agent-1',
        } as any)
      ).rejects.toThrow(/file_path.*is required/);
    });

    it('should require agent_id', async () => {
      await expect(
        fileLockHandlers.checkout(context, {
          file_path: '/path/to/file.ts',
        } as any)
      ).rejects.toThrow(/agent_id.*is required/);
    });

    it('should accept optional parameters', async () => {
      const result = await fileLockHandlers.checkout(context, {
        file_path: '/path/to/file.ts',
        agent_id: 'agent-1',
        session_id: testSessionId,
        project_id: testProjectId,
        expires_in: 7200,
        metadata: { reason: 'refactoring' },
      });

      expect(result.success).toBe(true);
      expect(result.lock.sessionId).toBe(testSessionId);
      expect(result.lock.projectId).toBe(testProjectId);
      expect(result.lock.metadata).toEqual({ reason: 'refactoring' });
    });

    it('should throw error if file already locked', async () => {
      await fileLockHandlers.checkout(context, {
        file_path: '/path/to/file.ts',
        agent_id: 'agent-1',
      });

      await expect(
        fileLockHandlers.checkout(context, {
          file_path: '/path/to/file.ts',
          agent_id: 'agent-2',
        })
      ).rejects.toThrow(/is locked|already locked/);
    });
  });

  describe('memory_file_checkin', () => {
    it('should check in a file successfully', async () => {
      await fileLockHandlers.checkout(context, {
        file_path: '/path/to/file.ts',
        agent_id: 'agent-1',
      });

      const result = await fileLockHandlers.checkin(context, {
        file_path: '/path/to/file.ts',
        agent_id: 'agent-1',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('checked in successfully');
    });

    it('should require file_path', async () => {
      await expect(
        fileLockHandlers.checkin(context, {
          agent_id: 'agent-1',
        } as any)
      ).rejects.toThrow(/file_path.*is required/);
    });

    it('should require agent_id', async () => {
      await expect(
        fileLockHandlers.checkin(context, {
          file_path: '/path/to/file.ts',
        } as any)
      ).rejects.toThrow(/agent_id.*is required/);
    });

    it('should throw error if file not locked', async () => {
      await expect(
        fileLockHandlers.checkin(context, {
          file_path: '/path/to/file.ts',
          agent_id: 'agent-1',
        })
      ).rejects.toThrow(/not locked|not found/);
    });

    it('should throw error if locked by different agent', async () => {
      await fileLockHandlers.checkout(context, {
        file_path: '/path/to/file.ts',
        agent_id: 'agent-1',
      });

      await expect(
        fileLockHandlers.checkin(context, {
          file_path: '/path/to/file.ts',
          agent_id: 'agent-2',
        })
      ).rejects.toThrow(/locked.*by|locked by agent|is locked/);
    });
  });

  describe('memory_file_lock_status', () => {
    it('should return lock status for locked file', async () => {
      await fileLockHandlers.checkout(context, {
        file_path: '/path/to/file.ts',
        agent_id: 'agent-1',
      });

      const result = await fileLockHandlers.status(context, {
        file_path: '/path/to/file.ts',
      });

      expect(result.success).toBe(true);
      expect(result.isLocked).toBe(true);
      expect(result.lock).toBeDefined();
      expect(result.lock?.filePath).toBe('/path/to/file.ts');
    });

    it('should return lock status for unlocked file', async () => {
      const result = await fileLockHandlers.status(context, {
        file_path: '/path/to/file.ts',
      });

      expect(result.success).toBe(true);
      expect(result.isLocked).toBe(false);
      expect(result.lock).toBeNull();
    });

    it('should require file_path', async () => {
      await expect(fileLockHandlers.status(context, {} as any)).rejects.toThrow(
        /file_path.*is required/
      );
    });
  });

  describe('memory_file_lock_list', () => {
    it('should list all active locks', async () => {
      await fileLockHandlers.checkout(context, {
        file_path: '/file1.ts',
        agent_id: 'agent-1',
      });
      await fileLockHandlers.checkout(context, {
        file_path: '/file2.ts',
        agent_id: 'agent-2',
      });

      const result = await fileLockHandlers.list(context, {});

      expect(result.success).toBe(true);
      expect(result.locks.length).toBe(2);
      expect(result.count).toBe(2);
    });

    it('should filter by project_id', async () => {
      await fileLockHandlers.checkout(context, {
        file_path: '/file1.ts',
        agent_id: 'agent-1',
        project_id: testProjectId,
      });
      await fileLockHandlers.checkout(context, {
        file_path: '/file2.ts',
        agent_id: 'agent-2',
      });

      const result = await fileLockHandlers.list(context, { project_id: testProjectId });

      expect(result.success).toBe(true);
      expect(result.locks.length).toBe(1);
      expect(result.locks[0].projectId).toBe(testProjectId);
    });

    it('should filter by session_id', async () => {
      await fileLockHandlers.checkout(context, {
        file_path: '/file1.ts',
        agent_id: 'agent-1',
        session_id: testSessionId,
      });
      await fileLockHandlers.checkout(context, {
        file_path: '/file2.ts',
        agent_id: 'agent-2',
      });

      const result = await fileLockHandlers.list(context, { session_id: testSessionId });

      expect(result.success).toBe(true);
      expect(result.locks.length).toBe(1);
      expect(result.locks[0].sessionId).toBe(testSessionId);
    });

    it('should filter by agent_id', async () => {
      await fileLockHandlers.checkout(context, {
        file_path: '/file1.ts',
        agent_id: 'agent-1',
      });
      await fileLockHandlers.checkout(context, {
        file_path: '/file2.ts',
        agent_id: 'agent-2',
      });
      await fileLockHandlers.checkout(context, {
        file_path: '/file3.ts',
        agent_id: 'agent-1',
      });

      const result = await fileLockHandlers.list(context, { agent_id: 'agent-1' });

      expect(result.success).toBe(true);
      expect(result.locks.length).toBe(2);
      expect(result.locks.every((lock) => lock.checkedOutBy === 'agent-1')).toBe(true);
    });
  });

  describe('memory_file_lock_force_unlock', () => {
    it('should force unlock a file', async () => {
      await fileLockHandlers.checkout(context, {
        file_path: '/path/to/file.ts',
        agent_id: 'agent-1',
      });

      const result = await fileLockHandlers.forceUnlock(context, {
        file_path: '/path/to/file.ts',
        agent_id: 'agent-2',
        reason: 'Emergency unlock',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('force unlocked');

      // Verify file is unlocked
      const status = await fileLockHandlers.status(context, {
        file_path: '/path/to/file.ts',
      });
      expect(status.isLocked).toBe(false);
    });

    it('should require file_path', async () => {
      await expect(
        fileLockHandlers.forceUnlock(context, {
          agent_id: 'agent-1',
        } as any)
      ).rejects.toThrow(/file_path.*is required/);
    });

    it('should require agent_id', async () => {
      await expect(
        fileLockHandlers.forceUnlock(context, {
          file_path: '/path/to/file.ts',
        } as any)
      ).rejects.toThrow(/agent_id.*is required/);
    });

    it('should throw error if file not locked', async () => {
      await expect(
        fileLockHandlers.forceUnlock(context, {
          file_path: '/path/to/file.ts',
          agent_id: 'agent-1',
        })
      ).rejects.toThrow(/not locked|not found/);
    });
  });

  describe('Lock lifecycle', () => {
    it('should complete full checkout -> checkin cycle', async () => {
      // Checkout
      const checkoutResult = await fileLockHandlers.checkout(context, {
        file_path: '/path/to/file.ts',
        agent_id: 'agent-1',
      });
      expect(checkoutResult.success).toBe(true);

      // Verify locked
      const status1 = await fileLockHandlers.status(context, {
        file_path: '/path/to/file.ts',
      });
      expect(status1.isLocked).toBe(true);

      // Checkin
      const checkinResult = await fileLockHandlers.checkin(context, {
        file_path: '/path/to/file.ts',
        agent_id: 'agent-1',
      });
      expect(checkinResult.success).toBe(true);

      // Verify unlocked
      const status2 = await fileLockHandlers.status(context, {
        file_path: '/path/to/file.ts',
      });
      expect(status2.isLocked).toBe(false);
    });
  });
});
