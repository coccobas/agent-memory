import { describe, it, expect, vi, beforeEach } from 'vitest';
import { conflictHandlers } from '../../src/mcp/handlers/conflicts.handler.js';
import type { AppContext } from '../../src/core/context.js';

describe('Conflicts Handler', () => {
  let mockContext: AppContext;
  let mockConflictsRepo: {
    list: ReturnType<typeof vi.fn>;
    resolve: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConflictsRepo = {
      list: vi.fn(),
      resolve: vi.fn(),
    };
    mockContext = {
      db: {} as any,
      repos: {
        conflicts: mockConflictsRepo,
      } as any,
      services: {} as any,
    };
  });

  describe('list', () => {
    it('should list all conflicts', async () => {
      const mockConflicts = [
        { id: 'conflict-1', entryType: 'guideline', resolved: false },
        { id: 'conflict-2', entryType: 'knowledge', resolved: true },
      ];
      mockConflictsRepo.list.mockResolvedValue(mockConflicts);

      const result = await conflictHandlers.list(mockContext, {});

      expect(result.conflicts).toEqual(mockConflicts);
      expect(result.meta.returnedCount).toBe(2);
    });

    it('should filter by entry type', async () => {
      mockConflictsRepo.list.mockResolvedValue([]);

      await conflictHandlers.list(mockContext, { entryType: 'guideline' });

      expect(mockConflictsRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({ entryType: 'guideline' }),
        expect.anything()
      );
    });

    it('should filter by resolved status', async () => {
      mockConflictsRepo.list.mockResolvedValue([]);

      await conflictHandlers.list(mockContext, { resolved: false });

      expect(mockConflictsRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({ resolved: false }),
        expect.anything()
      );
    });

    it('should apply pagination', async () => {
      mockConflictsRepo.list.mockResolvedValue([]);

      await conflictHandlers.list(mockContext, { limit: 10, offset: 20 });

      expect(mockConflictsRepo.list).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ limit: 10, offset: 20 })
      );
    });

    it('should return empty list when no conflicts', async () => {
      mockConflictsRepo.list.mockResolvedValue([]);

      const result = await conflictHandlers.list(mockContext, {});

      expect(result.conflicts).toEqual([]);
      expect(result.meta.returnedCount).toBe(0);
    });
  });

  describe('resolve', () => {
    it('should resolve a conflict', async () => {
      const resolvedConflict = {
        id: 'conflict-1',
        entryType: 'guideline',
        resolved: true,
        resolution: 'Kept version A',
        resolvedAt: new Date().toISOString(),
      };
      mockConflictsRepo.resolve.mockResolvedValue(resolvedConflict);

      const result = await conflictHandlers.resolve(mockContext, {
        id: 'conflict-1',
        resolution: 'Kept version A',
      });

      expect(result.success).toBe(true);
      expect(result.conflict).toEqual(resolvedConflict);
    });

    it('should pass resolvedBy', async () => {
      mockConflictsRepo.resolve.mockResolvedValue({});

      await conflictHandlers.resolve(mockContext, {
        id: 'conflict-1',
        resolution: 'Merged both versions',
        resolvedBy: 'admin-user',
      });

      expect(mockConflictsRepo.resolve).toHaveBeenCalledWith(
        'conflict-1',
        'Merged both versions',
        'admin-user'
      );
    });

    it('should throw when conflict not found', async () => {
      mockConflictsRepo.resolve.mockResolvedValue(null);

      await expect(
        conflictHandlers.resolve(mockContext, {
          id: 'nonexistent',
          resolution: 'Some resolution',
        })
      ).rejects.toThrow();
    });

    it('should throw when id is missing', async () => {
      await expect(
        conflictHandlers.resolve(mockContext, { resolution: 'Some resolution' })
      ).rejects.toThrow();
    });

    it('should throw when resolution is missing', async () => {
      await expect(conflictHandlers.resolve(mockContext, { id: 'conflict-1' })).rejects.toThrow();
    });
  });
});
