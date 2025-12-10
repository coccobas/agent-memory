import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { setupTestDb, cleanupTestDb, schema, createTestProject, createTestSession } from '../fixtures/test-helpers.js';

const TEST_DB_PATH = './data/test-file-locks-integration.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let testProjectId: string;
let testSessionId: string;

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js',
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
    it('should checkout a file successfully', () => {
      const result = fileLockHandlers.checkout({
        file_path: '/path/to/file.ts',
        agent_id: 'agent-1',
      });

      expect(result.success).toBe(true);
      expect(result.lock).toBeDefined();
      expect(result.lock.filePath).toBe('/path/to/file.ts');
      expect(result.lock.checkedOutBy).toBe('agent-1');
    });

    it('should require file_path', () => {
      expect(() => {
        fileLockHandlers.checkout({
          agent_id: 'agent-1',
        } as any);
      }).toThrow('file_path is required');
    });

    it('should require agent_id', () => {
      expect(() => {
        fileLockHandlers.checkout({
          file_path: '/path/to/file.ts',
        } as any);
      }).toThrow('agent_id is required');
    });

    it('should accept optional parameters', () => {
      const result = fileLockHandlers.checkout({
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

    it('should throw error if file already locked', () => {
      fileLockHandlers.checkout({
        file_path: '/path/to/file.ts',
        agent_id: 'agent-1',
      });

      expect(() => {
        fileLockHandlers.checkout({
          file_path: '/path/to/file.ts',
          agent_id: 'agent-2',
        });
      }).toThrow('already locked');
    });
  });

  describe('memory_file_checkin', () => {
    it('should check in a file successfully', () => {
      fileLockHandlers.checkout({
        file_path: '/path/to/file.ts',
        agent_id: 'agent-1',
      });

      const result = fileLockHandlers.checkin({
        file_path: '/path/to/file.ts',
        agent_id: 'agent-1',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('checked in successfully');
    });

    it('should require file_path', () => {
      expect(() => {
        fileLockHandlers.checkin({
          agent_id: 'agent-1',
        } as any);
      }).toThrow('file_path is required');
    });

    it('should require agent_id', () => {
      expect(() => {
        fileLockHandlers.checkin({
          file_path: '/path/to/file.ts',
        } as any);
      }).toThrow('agent_id is required');
    });

    it('should throw error if file not locked', () => {
      expect(() => {
        fileLockHandlers.checkin({
          file_path: '/path/to/file.ts',
          agent_id: 'agent-1',
        });
      }).toThrow('not locked');
    });

    it('should throw error if locked by different agent', () => {
      fileLockHandlers.checkout({
        file_path: '/path/to/file.ts',
        agent_id: 'agent-1',
      });

      expect(() => {
        fileLockHandlers.checkin({
          file_path: '/path/to/file.ts',
          agent_id: 'agent-2',
        });
      }).toThrow('locked by agent');
    });
  });

  describe('memory_file_lock_status', () => {
    it('should return lock status for locked file', () => {
      fileLockHandlers.checkout({
        file_path: '/path/to/file.ts',
        agent_id: 'agent-1',
      });

      const result = fileLockHandlers.status({
        file_path: '/path/to/file.ts',
      });

      expect(result.success).toBe(true);
      expect(result.isLocked).toBe(true);
      expect(result.lock).toBeDefined();
      expect(result.lock?.filePath).toBe('/path/to/file.ts');
    });

    it('should return lock status for unlocked file', () => {
      const result = fileLockHandlers.status({
        file_path: '/path/to/file.ts',
      });

      expect(result.success).toBe(true);
      expect(result.isLocked).toBe(false);
      expect(result.lock).toBeNull();
    });

    it('should require file_path', () => {
      expect(() => {
        fileLockHandlers.status({} as any);
      }).toThrow('file_path is required');
    });
  });

  describe('memory_file_lock_list', () => {
    it('should list all active locks', () => {
      fileLockHandlers.checkout({
        file_path: '/file1.ts',
        agent_id: 'agent-1',
      });
      fileLockHandlers.checkout({
        file_path: '/file2.ts',
        agent_id: 'agent-2',
      });

      const result = fileLockHandlers.list({});

      expect(result.success).toBe(true);
      expect(result.locks.length).toBe(2);
      expect(result.count).toBe(2);
    });

    it('should filter by project_id', () => {
      fileLockHandlers.checkout({
        file_path: '/file1.ts',
        agent_id: 'agent-1',
        project_id: testProjectId,
      });
      fileLockHandlers.checkout({
        file_path: '/file2.ts',
        agent_id: 'agent-2',
      });

      const result = fileLockHandlers.list({ project_id: testProjectId });

      expect(result.success).toBe(true);
      expect(result.locks.length).toBe(1);
      expect(result.locks[0].projectId).toBe(testProjectId);
    });

    it('should filter by session_id', () => {
      fileLockHandlers.checkout({
        file_path: '/file1.ts',
        agent_id: 'agent-1',
        session_id: testSessionId,
      });
      fileLockHandlers.checkout({
        file_path: '/file2.ts',
        agent_id: 'agent-2',
      });

      const result = fileLockHandlers.list({ session_id: testSessionId });

      expect(result.success).toBe(true);
      expect(result.locks.length).toBe(1);
      expect(result.locks[0].sessionId).toBe(testSessionId);
    });

    it('should filter by agent_id', () => {
      fileLockHandlers.checkout({
        file_path: '/file1.ts',
        agent_id: 'agent-1',
      });
      fileLockHandlers.checkout({
        file_path: '/file2.ts',
        agent_id: 'agent-2',
      });
      fileLockHandlers.checkout({
        file_path: '/file3.ts',
        agent_id: 'agent-1',
      });

      const result = fileLockHandlers.list({ agent_id: 'agent-1' });

      expect(result.success).toBe(true);
      expect(result.locks.length).toBe(2);
      expect(result.locks.every(lock => lock.checkedOutBy === 'agent-1')).toBe(true);
    });
  });

  describe('memory_file_lock_force_unlock', () => {
    it('should force unlock a file', () => {
      fileLockHandlers.checkout({
        file_path: '/path/to/file.ts',
        agent_id: 'agent-1',
      });

      const result = fileLockHandlers.forceUnlock({
        file_path: '/path/to/file.ts',
        agent_id: 'agent-2',
        reason: 'Emergency unlock',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('force unlocked');

      // Verify file is unlocked
      const status = fileLockHandlers.status({
        file_path: '/path/to/file.ts',
      });
      expect(status.isLocked).toBe(false);
    });

    it('should require file_path', () => {
      expect(() => {
        fileLockHandlers.forceUnlock({
          agent_id: 'agent-1',
        } as any);
      }).toThrow('file_path is required');
    });

    it('should require agent_id', () => {
      expect(() => {
        fileLockHandlers.forceUnlock({
          file_path: '/path/to/file.ts',
        } as any);
      }).toThrow('agent_id is required');
    });

    it('should throw error if file not locked', () => {
      expect(() => {
        fileLockHandlers.forceUnlock({
          file_path: '/path/to/file.ts',
          agent_id: 'agent-1',
        });
      }).toThrow('not locked');
    });
  });

  describe('Lock lifecycle', () => {
    it('should complete full checkout -> checkin cycle', () => {
      // Checkout
      const checkoutResult = fileLockHandlers.checkout({
        file_path: '/path/to/file.ts',
        agent_id: 'agent-1',
      });
      expect(checkoutResult.success).toBe(true);

      // Verify locked
      const status1 = fileLockHandlers.status({
        file_path: '/path/to/file.ts',
      });
      expect(status1.isLocked).toBe(true);

      // Checkin
      const checkinResult = fileLockHandlers.checkin({
        file_path: '/path/to/file.ts',
        agent_id: 'agent-1',
      });
      expect(checkinResult.success).toBe(true);

      // Verify unlocked
      const status2 = fileLockHandlers.status({
        file_path: '/path/to/file.ts',
      });
      expect(status2.isLocked).toBe(false);
    });
  });
});






