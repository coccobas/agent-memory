import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fileLockHandlers } from '../../src/mcp/handlers/file_locks.handler.js';
import type { AppContext } from '../../src/core/context.js';

describe('File Locks Handler', () => {
  let mockContext: AppContext;
  let mockFileLocksRepo: {
    checkout: ReturnType<typeof vi.fn>;
    checkin: ReturnType<typeof vi.fn>;
    getLock: ReturnType<typeof vi.fn>;
    listLocks: ReturnType<typeof vi.fn>;
    forceUnlock: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFileLocksRepo = {
      checkout: vi.fn(),
      checkin: vi.fn(),
      getLock: vi.fn(),
      listLocks: vi.fn(),
      forceUnlock: vi.fn(),
    };
    mockContext = {
      db: {} as any,
      repos: {
        fileLocks: mockFileLocksRepo,
      } as any,
      services: {} as any,
    };
  });

  describe('checkout', () => {
    it('should checkout a file lock', async () => {
      const mockLock = {
        id: 'lock-1',
        filePath: '/Users/test/project/file.ts',
        agentId: 'agent-1',
        createdAt: new Date().toISOString(),
      };
      mockFileLocksRepo.checkout.mockResolvedValue(mockLock);

      const result = await fileLockHandlers.checkout(mockContext, {
        file_path: '/Users/test/project/file.ts',
        agent_id: 'agent-1',
      });

      expect(result.success).toBe(true);
      expect(result.lock).toEqual(mockLock);
    });

    it('should pass optional parameters', async () => {
      mockFileLocksRepo.checkout.mockResolvedValue({});

      await fileLockHandlers.checkout(mockContext, {
        file_path: '/Users/test/file.ts',
        agent_id: 'agent-1',
        session_id: 'session-123',
        project_id: 'project-456',
        expires_in: 3600,
        metadata: { purpose: 'editing' },
      });

      expect(mockFileLocksRepo.checkout).toHaveBeenCalledWith(
        '/Users/test/file.ts',
        'agent-1',
        expect.objectContaining({
          sessionId: 'session-123',
          projectId: 'project-456',
          expiresIn: 3600,
          metadata: { purpose: 'editing' },
        })
      );
    });

    it('should throw for relative path', async () => {
      await expect(
        fileLockHandlers.checkout(mockContext, {
          file_path: 'relative/path.ts',
          agent_id: 'agent-1',
        })
      ).rejects.toThrow('absolute path');
    });

    it('should throw for path with traversal', async () => {
      await expect(
        fileLockHandlers.checkout(mockContext, {
          file_path: '/Users/test/../secret/file.ts',
          agent_id: 'agent-1',
        })
      ).rejects.toThrow();
    });

    it('should throw when file_path is missing', async () => {
      await expect(
        fileLockHandlers.checkout(mockContext, { agent_id: 'agent-1' })
      ).rejects.toThrow();
    });

    it('should throw when agent_id is missing', async () => {
      await expect(
        fileLockHandlers.checkout(mockContext, { file_path: '/Users/test/file.ts' })
      ).rejects.toThrow();
    });
  });

  describe('checkin', () => {
    it('should checkin a file lock', async () => {
      mockFileLocksRepo.checkin.mockResolvedValue(undefined);

      const result = await fileLockHandlers.checkin(mockContext, {
        file_path: '/Users/test/file.ts',
        agent_id: 'agent-1',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('checked in');
    });

    it('should throw for relative path', async () => {
      await expect(
        fileLockHandlers.checkin(mockContext, {
          file_path: 'relative/path.ts',
          agent_id: 'agent-1',
        })
      ).rejects.toThrow('absolute path');
    });
  });

  describe('status', () => {
    it('should return locked status when file is locked', async () => {
      const mockLock = {
        id: 'lock-1',
        filePath: '/Users/test/file.ts',
        agentId: 'agent-1',
      };
      mockFileLocksRepo.getLock.mockResolvedValue(mockLock);

      const result = await fileLockHandlers.status(mockContext, {
        file_path: '/Users/test/file.ts',
      });

      expect(result.success).toBe(true);
      expect(result.isLocked).toBe(true);
      expect(result.lock).toEqual(mockLock);
    });

    it('should return unlocked status when file is not locked', async () => {
      mockFileLocksRepo.getLock.mockResolvedValue(null);

      const result = await fileLockHandlers.status(mockContext, {
        file_path: '/Users/test/file.ts',
      });

      expect(result.success).toBe(true);
      expect(result.isLocked).toBe(false);
      expect(result.lock).toBeNull();
    });

    it('should throw for relative path', async () => {
      await expect(
        fileLockHandlers.status(mockContext, { file_path: 'relative/path.ts' })
      ).rejects.toThrow('absolute path');
    });
  });

  describe('list', () => {
    it('should list all locks', async () => {
      const mockLocks = [
        { id: 'lock-1', filePath: '/file1.ts', agentId: 'agent-1' },
        { id: 'lock-2', filePath: '/file2.ts', agentId: 'agent-2' },
      ];
      mockFileLocksRepo.listLocks.mockResolvedValue(mockLocks);

      const result = await fileLockHandlers.list(mockContext, {});

      expect(result.success).toBe(true);
      expect(result.locks).toEqual(mockLocks);
      expect(result.count).toBe(2);
    });

    it('should filter by project_id', async () => {
      mockFileLocksRepo.listLocks.mockResolvedValue([]);

      await fileLockHandlers.list(mockContext, { project_id: 'proj-123' });

      expect(mockFileLocksRepo.listLocks).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'proj-123' })
      );
    });

    it('should filter by session_id', async () => {
      mockFileLocksRepo.listLocks.mockResolvedValue([]);

      await fileLockHandlers.list(mockContext, { session_id: 'sess-123' });

      expect(mockFileLocksRepo.listLocks).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'sess-123' })
      );
    });

    it('should filter by agent_id', async () => {
      mockFileLocksRepo.listLocks.mockResolvedValue([]);

      await fileLockHandlers.list(mockContext, { agent_id: 'agent-1' });

      expect(mockFileLocksRepo.listLocks).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'agent-1' })
      );
    });
  });

  describe('forceUnlock', () => {
    it('should force unlock a file', async () => {
      mockFileLocksRepo.forceUnlock.mockResolvedValue(undefined);

      const result = await fileLockHandlers.forceUnlock(mockContext, {
        file_path: '/Users/test/file.ts',
        agent_id: 'admin-agent',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('force unlocked');
    });

    it('should pass reason', async () => {
      mockFileLocksRepo.forceUnlock.mockResolvedValue(undefined);

      await fileLockHandlers.forceUnlock(mockContext, {
        file_path: '/Users/test/file.ts',
        agent_id: 'admin-agent',
        reason: 'Agent unresponsive',
      });

      expect(mockFileLocksRepo.forceUnlock).toHaveBeenCalledWith(
        '/Users/test/file.ts',
        'admin-agent',
        'Agent unresponsive'
      );
    });

    it('should throw for relative path', async () => {
      await expect(
        fileLockHandlers.forceUnlock(mockContext, {
          file_path: 'relative/path.ts',
          agent_id: 'agent-1',
        })
      ).rejects.toThrow('absolute path');
    });
  });
});
