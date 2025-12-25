/**
 * Unit tests for LocalLockAdapter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalLockAdapter, createLocalLockAdapter } from '../../src/core/adapters/local-lock.adapter.js';
import type { IFileLockRepository } from '../../src/core/interfaces/repositories.js';

describe('LocalLockAdapter', () => {
  let mockRepo: {
    checkout: ReturnType<typeof vi.fn>;
    checkin: ReturnType<typeof vi.fn>;
    forceUnlock: ReturnType<typeof vi.fn>;
    isLocked: ReturnType<typeof vi.fn>;
    getLock: ReturnType<typeof vi.fn>;
    listLocks: ReturnType<typeof vi.fn>;
    cleanupExpiredLocks: ReturnType<typeof vi.fn>;
  };
  let adapter: LocalLockAdapter;

  const mockLock = {
    filePath: '/test/file.ts',
    checkedOutBy: 'agent-1',
    checkedOutAt: '2024-01-01T00:00:00.000Z',
    expiresAt: '2024-01-01T01:00:00.000Z',
    metadata: { purpose: 'testing' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = {
      checkout: vi.fn().mockResolvedValue(mockLock),
      checkin: vi.fn().mockResolvedValue(undefined),
      forceUnlock: vi.fn().mockResolvedValue(undefined),
      isLocked: vi.fn().mockResolvedValue(false),
      getLock: vi.fn().mockResolvedValue(null),
      listLocks: vi.fn().mockResolvedValue([]),
      cleanupExpiredLocks: vi.fn().mockResolvedValue(0),
    };
    adapter = new LocalLockAdapter(mockRepo as unknown as IFileLockRepository);
  });

  describe('acquire', () => {
    it('should successfully acquire a lock', async () => {
      const result = await adapter.acquire('/test/file.ts', 'agent-1');

      expect(result.acquired).toBe(true);
      expect(result.lock).toBeDefined();
      expect(result.lock?.key).toBe('/test/file.ts');
      expect(result.lock?.owner).toBe('agent-1');
      expect(mockRepo.checkout).toHaveBeenCalledWith('/test/file.ts', 'agent-1', {
        expiresIn: undefined,
        metadata: undefined,
      });
    });

    it('should pass TTL option converted to seconds', async () => {
      await adapter.acquire('/test/file.ts', 'agent-1', { ttlMs: 60000 });

      expect(mockRepo.checkout).toHaveBeenCalledWith('/test/file.ts', 'agent-1', {
        expiresIn: 60,
        metadata: undefined,
      });
    });

    it('should pass metadata option', async () => {
      const metadata = { purpose: 'editing' };
      await adapter.acquire('/test/file.ts', 'agent-1', { metadata });

      expect(mockRepo.checkout).toHaveBeenCalledWith('/test/file.ts', 'agent-1', {
        expiresIn: undefined,
        metadata,
      });
    });

    it('should return acquired: false when lock is held by another agent', async () => {
      mockRepo.checkout.mockRejectedValue(new Error('File is already locked by another agent'));

      const result = await adapter.acquire('/test/file.ts', 'agent-2');

      expect(result.acquired).toBe(false);
      expect(result.lock).toBeUndefined();
    });

    it('should rethrow non-lock errors', async () => {
      mockRepo.checkout.mockRejectedValue(new Error('Database connection failed'));

      await expect(adapter.acquire('/test/file.ts', 'agent-1')).rejects.toThrow('Database connection failed');
    });
  });

  describe('release', () => {
    it('should successfully release a lock', async () => {
      const result = await adapter.release('/test/file.ts', 'agent-1');

      expect(result).toBe(true);
      expect(mockRepo.checkin).toHaveBeenCalledWith('/test/file.ts', 'agent-1');
    });

    it('should return false when release fails', async () => {
      mockRepo.checkin.mockRejectedValue(new Error('Lock not found'));

      const result = await adapter.release('/test/file.ts', 'agent-1');

      expect(result).toBe(false);
    });
  });

  describe('forceRelease', () => {
    it('should successfully force release a lock', async () => {
      const result = await adapter.forceRelease('/test/file.ts', 'Admin override');

      expect(result).toBe(true);
      expect(mockRepo.forceUnlock).toHaveBeenCalledWith('/test/file.ts', 'system', 'Admin override');
    });

    it('should force release without reason', async () => {
      const result = await adapter.forceRelease('/test/file.ts');

      expect(result).toBe(true);
      expect(mockRepo.forceUnlock).toHaveBeenCalledWith('/test/file.ts', 'system', undefined);
    });

    it('should return false when force release fails', async () => {
      mockRepo.forceUnlock.mockRejectedValue(new Error('Lock not found'));

      const result = await adapter.forceRelease('/test/file.ts');

      expect(result).toBe(false);
    });
  });

  describe('isLocked', () => {
    it('should return true when file is locked', async () => {
      mockRepo.isLocked.mockResolvedValue(true);

      const result = await adapter.isLocked('/test/file.ts');

      expect(result).toBe(true);
      expect(mockRepo.isLocked).toHaveBeenCalledWith('/test/file.ts');
    });

    it('should return false when file is not locked', async () => {
      mockRepo.isLocked.mockResolvedValue(false);

      const result = await adapter.isLocked('/test/file.ts');

      expect(result).toBe(false);
    });
  });

  describe('getLock', () => {
    it('should return lock info when lock exists', async () => {
      mockRepo.getLock.mockResolvedValue(mockLock);

      const result = await adapter.getLock('/test/file.ts');

      expect(result).not.toBeNull();
      expect(result?.key).toBe('/test/file.ts');
      expect(result?.owner).toBe('agent-1');
      expect(result?.acquiredAt).toBeInstanceOf(Date);
      expect(result?.expiresAt).toBeInstanceOf(Date);
      expect(result?.metadata).toEqual({ purpose: 'testing' });
    });

    it('should return null when lock does not exist', async () => {
      mockRepo.getLock.mockResolvedValue(null);

      const result = await adapter.getLock('/test/file.ts');

      expect(result).toBeNull();
    });

    it('should handle lock without expiresAt', async () => {
      mockRepo.getLock.mockResolvedValue({
        ...mockLock,
        expiresAt: null,
      });

      const result = await adapter.getLock('/test/file.ts');

      expect(result?.expiresAt).toBeNull();
    });

    it('should handle lock without metadata', async () => {
      mockRepo.getLock.mockResolvedValue({
        ...mockLock,
        metadata: null,
      });

      const result = await adapter.getLock('/test/file.ts');

      expect(result?.metadata).toBeUndefined();
    });
  });

  describe('listLocks', () => {
    it('should list all locks without filter', async () => {
      mockRepo.listLocks.mockResolvedValue([mockLock]);

      const result = await adapter.listLocks();

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('/test/file.ts');
      expect(mockRepo.listLocks).toHaveBeenCalledWith(undefined);
    });

    it('should filter locks by owner', async () => {
      mockRepo.listLocks.mockResolvedValue([mockLock]);

      const result = await adapter.listLocks({ owner: 'agent-1' });

      expect(result).toHaveLength(1);
      expect(mockRepo.listLocks).toHaveBeenCalledWith({ agentId: 'agent-1' });
    });

    it('should return empty array when no locks', async () => {
      mockRepo.listLocks.mockResolvedValue([]);

      const result = await adapter.listLocks();

      expect(result).toHaveLength(0);
    });
  });

  describe('cleanupExpired', () => {
    it('should cleanup expired locks and return count', async () => {
      mockRepo.cleanupExpiredLocks.mockResolvedValue(5);

      const result = await adapter.cleanupExpired();

      expect(result).toBe(5);
      expect(mockRepo.cleanupExpiredLocks).toHaveBeenCalled();
    });

    it('should return 0 when no expired locks', async () => {
      mockRepo.cleanupExpiredLocks.mockResolvedValue(0);

      const result = await adapter.cleanupExpired();

      expect(result).toBe(0);
    });
  });

  describe('createLocalLockAdapter', () => {
    it('should create adapter instance', () => {
      const adapter = createLocalLockAdapter(mockRepo as unknown as IFileLockRepository);

      expect(adapter).toBeInstanceOf(LocalLockAdapter);
    });
  });
});
