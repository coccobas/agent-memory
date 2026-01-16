import { describe, it, expect, vi, beforeEach } from 'vitest';
import { relationHandlers } from '../../src/mcp/handlers/relations.handler.js';
import * as entryAccessUtil from '../../src/utils/entry-access.js';
import type { AppContext } from '../../src/core/context.js';

vi.mock('../../src/utils/entry-access.js');

describe('Relations Handler', () => {
  let mockContext: AppContext;
  let mockRelationsRepo: {
    create: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    deleteByEntries: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(entryAccessUtil.requireEntryPermission).mockResolvedValue(undefined);
    mockRelationsRepo = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
      delete: vi.fn(),
      deleteByEntries: vi.fn(),
    };
    mockContext = {
      db: {} as any,
      repos: {
        entryRelations: mockRelationsRepo,
      } as any,
      services: {} as any,
    };
  });

  describe('create', () => {
    it('should create a relation', async () => {
      const mockRelation = {
        id: 'rel-1',
        sourceType: 'knowledge',
        sourceId: 'k-1',
        targetType: 'guideline',
        targetId: 'g-1',
        relationType: 'related_to',
      };
      mockRelationsRepo.create.mockResolvedValue(mockRelation);

      const result = await relationHandlers.create(mockContext, {
        agentId: 'agent-1',
        sourceType: 'knowledge',
        sourceId: 'k-1',
        targetType: 'guideline',
        targetId: 'g-1',
        relationType: 'related_to',
      });

      expect(result.success).toBe(true);
      expect(result.relation).toEqual(mockRelation);
    });

    it('should check permissions for both source and target', async () => {
      mockRelationsRepo.create.mockResolvedValue({});

      await relationHandlers.create(mockContext, {
        agentId: 'agent-1',
        sourceType: 'knowledge',
        sourceId: 'k-1',
        targetType: 'guideline',
        targetId: 'g-1',
        relationType: 'depends_on',
      });

      expect(entryAccessUtil.requireEntryPermission).toHaveBeenCalledTimes(2);
      expect(entryAccessUtil.requireEntryPermission).toHaveBeenCalledWith(
        mockContext,
        expect.objectContaining({
          entryType: 'knowledge',
          entryId: 'k-1',
          action: 'write',
        })
      );
      expect(entryAccessUtil.requireEntryPermission).toHaveBeenCalledWith(
        mockContext,
        expect.objectContaining({
          entryType: 'guideline',
          entryId: 'g-1',
          action: 'write',
        })
      );
    });

    it('should pass createdBy', async () => {
      mockRelationsRepo.create.mockResolvedValue({});

      await relationHandlers.create(mockContext, {
        agentId: 'agent-1',
        sourceType: 'tool',
        sourceId: 't-1',
        targetType: 'tool',
        targetId: 't-2',
        relationType: 'applies_to',
        createdBy: 'admin-user',
      });

      expect(mockRelationsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ createdBy: 'admin-user' })
      );
    });

    it('should throw when agentId is missing', async () => {
      await expect(
        relationHandlers.create(mockContext, {
          sourceType: 'knowledge',
          sourceId: 'k-1',
          targetType: 'guideline',
          targetId: 'g-1',
          relationType: 'related_to',
        })
      ).rejects.toThrow();
    });
  });

  describe('list', () => {
    it('should list relations for source entry', async () => {
      const mockRelations = [
        { id: 'rel-1', targetType: 'guideline', targetId: 'g-1' },
        { id: 'rel-2', targetType: 'knowledge', targetId: 'k-2' },
      ];
      mockRelationsRepo.list.mockResolvedValue(mockRelations);

      const result = await relationHandlers.list(mockContext, {
        agentId: 'agent-1',
        sourceType: 'knowledge',
        sourceId: 'k-1',
      });

      expect(result.relations).toEqual(mockRelations);
      expect(result.meta.returnedCount).toBe(2);
    });

    it('should list relations for target entry', async () => {
      mockRelationsRepo.list.mockResolvedValue([]);

      await relationHandlers.list(mockContext, {
        agentId: 'agent-1',
        targetType: 'guideline',
        targetId: 'g-1',
      });

      expect(mockRelationsRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({
          targetType: 'guideline',
          targetId: 'g-1',
        }),
        expect.anything()
      );
    });

    it('should throw when neither source nor target is anchored', async () => {
      await expect(
        relationHandlers.list(mockContext, {
          agentId: 'agent-1',
          relationType: 'related_to',
        })
      ).rejects.toThrow();
    });

    it('should apply pagination', async () => {
      mockRelationsRepo.list.mockResolvedValue([]);

      await relationHandlers.list(mockContext, {
        agentId: 'agent-1',
        sourceType: 'knowledge',
        sourceId: 'k-1',
        limit: 10,
        offset: 20,
      });

      expect(mockRelationsRepo.list).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ limit: 10, offset: 20 })
      );
    });

    it('should filter by relation type', async () => {
      mockRelationsRepo.list.mockResolvedValue([]);

      await relationHandlers.list(mockContext, {
        agentId: 'agent-1',
        sourceType: 'tool',
        sourceId: 't-1',
        relationType: 'depends_on',
      });

      expect(mockRelationsRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({ relationType: 'depends_on' }),
        expect.anything()
      );
    });
  });

  describe('delete', () => {
    it('should delete relation by id', async () => {
      mockRelationsRepo.getById.mockResolvedValue({
        id: 'rel-1',
        sourceType: 'knowledge',
        sourceId: 'k-1',
      });
      mockRelationsRepo.delete.mockResolvedValue(true);

      const result = await relationHandlers.delete(mockContext, {
        agentId: 'agent-1',
        id: 'rel-1',
      });

      expect(result.success).toBe(true);
    });

    it('should delete relation by entry identifiers', async () => {
      mockRelationsRepo.deleteByEntries.mockResolvedValue(true);

      const result = await relationHandlers.delete(mockContext, {
        agentId: 'agent-1',
        sourceType: 'knowledge',
        sourceId: 'k-1',
        targetType: 'guideline',
        targetId: 'g-1',
        relationType: 'related_to',
      });

      expect(result.success).toBe(true);
      expect(mockRelationsRepo.deleteByEntries).toHaveBeenCalledWith(
        'knowledge',
        'k-1',
        'guideline',
        'g-1',
        'related_to'
      );
    });

    it('should return false when relation not found by id', async () => {
      mockRelationsRepo.getById.mockResolvedValue(null);

      const result = await relationHandlers.delete(mockContext, {
        agentId: 'agent-1',
        id: 'nonexistent',
      });

      expect(result.success).toBe(false);
    });

    it('should throw when neither id nor entry identifiers provided', async () => {
      await expect(relationHandlers.delete(mockContext, { agentId: 'agent-1' })).rejects.toThrow();
    });

    it('should skip permission check for project source type', async () => {
      mockRelationsRepo.getById.mockResolvedValue({
        id: 'rel-1',
        sourceType: 'project',
        sourceId: 'proj-1',
      });
      mockRelationsRepo.delete.mockResolvedValue(true);

      await relationHandlers.delete(mockContext, {
        agentId: 'agent-1',
        id: 'rel-1',
      });

      // Should not have called permission check for project type
      expect(entryAccessUtil.requireEntryPermission).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ entryType: 'project' })
      );
    });
  });
});
