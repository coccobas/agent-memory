import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  schema,
  createTestProject,
  createTestSession,
} from '../fixtures/test-helpers.js';
import { fileLockRepo } from '../../src/db/repositories/file_locks.js';
import { DEFAULT_LOCK_TIMEOUT_SECONDS } from '../../src/db/repositories/base.js';

const TEST_DB_PATH = './data/test-file-locks.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
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

describe('File Locks Repository', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;

    // Create test project and session for FK-constrained tests
    const project = createTestProject(db, 'Lock Test Project');
    testProjectId = project.id;
    const session = createTestSession(db, testProjectId, 'Lock Test Session');
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

  describe('checkout', () => {
    it('should checkout a file successfully', () => {
      const filePath = '/path/to/file.ts';
      const agentId = 'agent-1';

      const lock = fileLockRepo.checkout(filePath, agentId);

      expect(lock).toBeDefined();
      expect(lock.filePath).toBe(filePath);
      expect(lock.checkedOutBy).toBe(agentId);
      expect(lock.expiresAt).toBeDefined();
    });

    it('should use default timeout if not specified', () => {
      const filePath = '/path/to/file.ts';
      const agentId = 'agent-1';

      const lock = fileLockRepo.checkout(filePath, agentId);
      const checkedOutAt = new Date(lock.checkedOutAt).getTime();
      const expiresAt = new Date(lock.expiresAt!).getTime();
      const timeoutSeconds = (expiresAt - checkedOutAt) / 1000;

      expect(timeoutSeconds).toBeCloseTo(DEFAULT_LOCK_TIMEOUT_SECONDS, 1);
    });

    it('should use custom timeout if specified', () => {
      const filePath = '/path/to/file.ts';
      const agentId = 'agent-1';
      const customTimeout = 7200; // 2 hours

      const lock = fileLockRepo.checkout(filePath, agentId, { expiresIn: customTimeout });
      const checkedOutAt = new Date(lock.checkedOutAt).getTime();
      const expiresAt = new Date(lock.expiresAt!).getTime();
      const timeoutSeconds = (expiresAt - checkedOutAt) / 1000;

      expect(timeoutSeconds).toBeCloseTo(customTimeout, 1);
    });

    it('should throw error if file is already locked', () => {
      const filePath = '/path/to/file.ts';
      const agentId1 = 'agent-1';
      const agentId2 = 'agent-2';

      fileLockRepo.checkout(filePath, agentId1);

      expect(() => {
        fileLockRepo.checkout(filePath, agentId2);
      }).toThrow('already locked');
    });

    it('should store session and project IDs', () => {
      const filePath = '/path/to/file.ts';
      const agentId = 'agent-1';

      const lock = fileLockRepo.checkout(filePath, agentId, {
        sessionId: testSessionId,
        projectId: testProjectId,
      });

      expect(lock.sessionId).toBe(testSessionId);
      expect(lock.projectId).toBe(testProjectId);
    });

    it('should store metadata', () => {
      const filePath = '/path/to/file.ts';
      const agentId = 'agent-1';
      const metadata = { reason: 'refactoring', priority: 'high' };

      const lock = fileLockRepo.checkout(filePath, agentId, { metadata });

      expect(lock.metadata).toEqual(metadata);
    });
  });

  describe('checkin', () => {
    it('should check in a file successfully', () => {
      const filePath = '/path/to/file.ts';
      const agentId = 'agent-1';

      fileLockRepo.checkout(filePath, agentId);
      fileLockRepo.checkin(filePath, agentId);

      expect(fileLockRepo.isLocked(filePath)).toBe(false);
    });

    it('should throw error if file is not locked', () => {
      const filePath = '/path/to/file.ts';
      const agentId = 'agent-1';

      expect(() => {
        fileLockRepo.checkin(filePath, agentId);
      }).toThrow('not locked');
    });

    it('should throw error if locked by different agent', () => {
      const filePath = '/path/to/file.ts';
      const agentId1 = 'agent-1';
      const agentId2 = 'agent-2';

      fileLockRepo.checkout(filePath, agentId1);

      expect(() => {
        fileLockRepo.checkin(filePath, agentId2);
      }).toThrow('locked by agent');
    });
  });

  describe('forceUnlock', () => {
    it('should force unlock a file', () => {
      const filePath = '/path/to/file.ts';
      const agentId1 = 'agent-1';
      const agentId2 = 'agent-2';

      fileLockRepo.checkout(filePath, agentId1);
      fileLockRepo.forceUnlock(filePath, agentId2, 'Emergency unlock');

      expect(fileLockRepo.isLocked(filePath)).toBe(false);
    });

    it('should throw error if file is not locked', () => {
      const filePath = '/path/to/file.ts';
      const agentId = 'agent-1';

      expect(() => {
        fileLockRepo.forceUnlock(filePath, agentId);
      }).toThrow('not locked');
    });
  });

  describe('isLocked', () => {
    it('should return true for locked file', () => {
      const filePath = '/path/to/file.ts';
      const agentId = 'agent-1';

      fileLockRepo.checkout(filePath, agentId);

      expect(fileLockRepo.isLocked(filePath)).toBe(true);
    });

    it('should return false for unlocked file', () => {
      const filePath = '/path/to/file.ts';

      expect(fileLockRepo.isLocked(filePath)).toBe(false);
    });

    it('should return false for expired lock', async () => {
      const filePath = '/path/to/file.ts';
      const agentId = 'agent-1';

      // Create a lock with very short timeout
      fileLockRepo.checkout(filePath, agentId, { expiresIn: 0.1 }); // 100ms

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(fileLockRepo.isLocked(filePath)).toBe(false);
    });
  });

  describe('getLock', () => {
    it('should return lock information', () => {
      const filePath = '/path/to/file.ts';
      const agentId = 'agent-1';

      fileLockRepo.checkout(filePath, agentId);
      const lock = fileLockRepo.getLock(filePath);

      expect(lock).toBeDefined();
      expect(lock?.filePath).toBe(filePath);
      expect(lock?.checkedOutBy).toBe(agentId);
    });

    it('should return null for unlocked file', () => {
      const filePath = '/path/to/file.ts';

      const lock = fileLockRepo.getLock(filePath);

      expect(lock).toBeNull();
    });
  });

  describe('listLocks', () => {
    it('should list all active locks', () => {
      fileLockRepo.checkout('/file1.ts', 'agent-1');
      fileLockRepo.checkout('/file2.ts', 'agent-2');
      fileLockRepo.checkout('/file3.ts', 'agent-1');

      const locks = fileLockRepo.listLocks();

      expect(locks.length).toBe(3);
    });

    it('should filter by project ID', () => {
      fileLockRepo.checkout('/file1.ts', 'agent-1', { projectId: testProjectId });
      fileLockRepo.checkout('/file2.ts', 'agent-2'); // no project

      const locks = fileLockRepo.listLocks({ projectId: testProjectId });

      expect(locks.length).toBe(1);
      expect(locks[0].projectId).toBe(testProjectId);
    });

    it('should filter by session ID', () => {
      fileLockRepo.checkout('/file1.ts', 'agent-1', { sessionId: testSessionId });
      fileLockRepo.checkout('/file2.ts', 'agent-2'); // no session

      const locks = fileLockRepo.listLocks({ sessionId: testSessionId });

      expect(locks.length).toBe(1);
      expect(locks[0].sessionId).toBe(testSessionId);
    });

    it('should filter by agent ID', () => {
      fileLockRepo.checkout('/file1.ts', 'agent-1');
      fileLockRepo.checkout('/file2.ts', 'agent-2');
      fileLockRepo.checkout('/file3.ts', 'agent-1');

      const locks = fileLockRepo.listLocks({ agentId: 'agent-1' });

      expect(locks.length).toBe(2);
      expect(locks.every((lock) => lock.checkedOutBy === 'agent-1')).toBe(true);
    });
  });

  describe('cleanupExpiredLocks', () => {
    it('should remove expired locks', async () => {
      fileLockRepo.checkout('/file1.ts', 'agent-1', { expiresIn: 0.1 });
      fileLockRepo.checkout('/file2.ts', 'agent-2', { expiresIn: 1000 });

      // Wait for first lock to expire
      await new Promise((resolve) => setTimeout(resolve, 200));

      const cleaned = fileLockRepo.cleanupExpiredLocks();

      expect(cleaned).toBe(1);
      expect(fileLockRepo.isLocked('/file1.ts')).toBe(false);
      expect(fileLockRepo.isLocked('/file2.ts')).toBe(true);
    });

    it('should return 0 if no expired locks', () => {
      fileLockRepo.checkout('/file1.ts', 'agent-1');

      const cleaned = fileLockRepo.cleanupExpiredLocks();

      expect(cleaned).toBe(0);
    });
  });
});
