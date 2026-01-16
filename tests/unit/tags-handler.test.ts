import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tagHandlers } from '../../src/mcp/handlers/tags.handler.js';
import * as entryAccessUtil from '../../src/utils/entry-access.js';
import type { AppContext } from '../../src/core/context.js';

vi.mock('../../src/utils/entry-access.js');

describe('Tags Handler', () => {
  let mockContext: AppContext;
  let mockTagsRepo: {
    create: ReturnType<typeof vi.fn>;
    getByName: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };
  let mockEntryTagsRepo: {
    attach: ReturnType<typeof vi.fn>;
    detach: ReturnType<typeof vi.fn>;
    getTagsForEntry: ReturnType<typeof vi.fn>;
  };
  let mockEventEmit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(entryAccessUtil.requireEntryPermissionWithScope).mockResolvedValue({
      scopeType: 'project',
      scopeId: 'proj-123',
    } as any);
    mockEventEmit = vi.fn();
    mockTagsRepo = {
      create: vi.fn(),
      getByName: vi.fn(),
      list: vi.fn(),
    };
    mockEntryTagsRepo = {
      attach: vi.fn(),
      detach: vi.fn(),
      getTagsForEntry: vi.fn(),
    };
    mockContext = {
      db: {} as any,
      repos: {
        tags: mockTagsRepo,
        entryTags: mockEntryTagsRepo,
      } as any,
      services: {} as any,
      unifiedAdapters: {
        event: {
          emit: mockEventEmit,
          subscribe: vi.fn(),
        },
      },
    } as any;
  });

  describe('create', () => {
    it('should create a new tag', async () => {
      const mockTag = { id: 'tag-1', name: 'typescript', category: 'language' };
      mockTagsRepo.getByName.mockResolvedValue(null);
      mockTagsRepo.create.mockResolvedValue(mockTag);

      const result = await tagHandlers.create(mockContext, {
        agentId: 'agent-1',
        name: 'typescript',
        category: 'language',
      });

      expect(result.success).toBe(true);
      expect(result.tag).toEqual(mockTag);
      expect(result.existed).toBe(false);
    });

    it('should return existing tag without creating', async () => {
      const existingTag = { id: 'tag-1', name: 'python', category: 'language' };
      mockTagsRepo.getByName.mockResolvedValue(existingTag);

      const result = await tagHandlers.create(mockContext, {
        agentId: 'agent-1',
        name: 'python',
      });

      expect(result.success).toBe(true);
      expect(result.tag).toEqual(existingTag);
      expect(result.existed).toBe(true);
      expect(mockTagsRepo.create).not.toHaveBeenCalled();
    });

    it('should pass description', async () => {
      mockTagsRepo.getByName.mockResolvedValue(null);
      mockTagsRepo.create.mockResolvedValue({});

      await tagHandlers.create(mockContext, {
        agentId: 'agent-1',
        name: 'api-design',
        description: 'Related to API design patterns',
      });

      expect(mockTagsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Related to API design patterns' })
      );
    });

    it('should throw when agentId is missing', async () => {
      await expect(tagHandlers.create(mockContext, { name: 'test-tag' })).rejects.toThrow();
    });

    it('should throw when name is missing', async () => {
      await expect(tagHandlers.create(mockContext, { agentId: 'agent-1' })).rejects.toThrow();
    });
  });

  describe('list', () => {
    it('should list all tags', async () => {
      const mockTags = [
        { id: 'tag-1', name: 'typescript' },
        { id: 'tag-2', name: 'python' },
      ];
      mockTagsRepo.list.mockResolvedValue(mockTags);

      const result = await tagHandlers.list(mockContext, { agentId: 'agent-1' });

      expect(result.tags).toEqual(mockTags);
      expect(result.meta.returnedCount).toBe(2);
    });

    it('should filter by category', async () => {
      mockTagsRepo.list.mockResolvedValue([]);

      await tagHandlers.list(mockContext, {
        agentId: 'agent-1',
        category: 'language',
      });

      expect(mockTagsRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'language' }),
        expect.anything()
      );
    });

    it('should filter by isPredefined', async () => {
      mockTagsRepo.list.mockResolvedValue([]);

      await tagHandlers.list(mockContext, {
        agentId: 'agent-1',
        isPredefined: true,
      });

      expect(mockTagsRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({ isPredefined: true }),
        expect.anything()
      );
    });

    it('should apply pagination', async () => {
      mockTagsRepo.list.mockResolvedValue([]);

      await tagHandlers.list(mockContext, {
        agentId: 'agent-1',
        limit: 10,
        offset: 20,
      });

      expect(mockTagsRepo.list).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ limit: 10, offset: 20 })
      );
    });
  });

  describe('attach', () => {
    it('should attach a tag by tagId', async () => {
      const mockEntryTag = { entryType: 'knowledge', entryId: 'k-1', tagId: 'tag-1' };
      mockEntryTagsRepo.attach.mockResolvedValue(mockEntryTag);

      const result = await tagHandlers.attach(mockContext, {
        agentId: 'agent-1',
        entryType: 'knowledge',
        entryId: 'k-1',
        tagId: 'tag-1',
      });

      expect(result.success).toBe(true);
      expect(result.entryTag).toEqual(mockEntryTag);
    });

    it('should attach a tag by tagName', async () => {
      mockEntryTagsRepo.attach.mockResolvedValue({});

      await tagHandlers.attach(mockContext, {
        agentId: 'agent-1',
        entryType: 'guideline',
        entryId: 'g-1',
        tagName: 'security',
      });

      expect(mockEntryTagsRepo.attach).toHaveBeenCalledWith(
        expect.objectContaining({ tagName: 'security' })
      );
    });

    it('should emit entry changed event', async () => {
      mockEntryTagsRepo.attach.mockResolvedValue({});

      await tagHandlers.attach(mockContext, {
        agentId: 'agent-1',
        entryType: 'tool',
        entryId: 't-1',
        tagId: 'tag-1',
      });

      expect(mockEventEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          entryType: 'tool',
          entryId: 't-1',
          action: 'update',
        })
      );
    });

    it('should throw when neither tagId nor tagName provided', async () => {
      await expect(
        tagHandlers.attach(mockContext, {
          agentId: 'agent-1',
          entryType: 'knowledge',
          entryId: 'k-1',
        })
      ).rejects.toThrow();
    });

    it('should check permissions', async () => {
      mockEntryTagsRepo.attach.mockResolvedValue({});

      await tagHandlers.attach(mockContext, {
        agentId: 'agent-1',
        entryType: 'knowledge',
        entryId: 'k-1',
        tagId: 'tag-1',
      });

      expect(entryAccessUtil.requireEntryPermissionWithScope).toHaveBeenCalledWith(
        mockContext,
        expect.objectContaining({
          agentId: 'agent-1',
          action: 'write',
          entryType: 'knowledge',
          entryId: 'k-1',
        })
      );
    });
  });

  describe('detach', () => {
    it('should detach a tag', async () => {
      mockEntryTagsRepo.detach.mockResolvedValue(true);

      const result = await tagHandlers.detach(mockContext, {
        agentId: 'agent-1',
        entryType: 'knowledge',
        entryId: 'k-1',
        tagId: 'tag-1',
      });

      expect(result.success).toBe(true);
    });

    it('should emit entry changed event on success', async () => {
      mockEntryTagsRepo.detach.mockResolvedValue(true);

      await tagHandlers.detach(mockContext, {
        agentId: 'agent-1',
        entryType: 'guideline',
        entryId: 'g-1',
        tagId: 'tag-1',
      });

      expect(mockEventEmit).toHaveBeenCalled();
    });

    it('should not emit event on failure', async () => {
      mockEntryTagsRepo.detach.mockResolvedValue(false);

      await tagHandlers.detach(mockContext, {
        agentId: 'agent-1',
        entryType: 'tool',
        entryId: 't-1',
        tagId: 'tag-1',
      });

      expect(mockEventEmit).not.toHaveBeenCalled();
    });
  });

  describe('forEntry', () => {
    it('should get tags for an entry', async () => {
      const mockTags = [
        { id: 'tag-1', name: 'typescript' },
        { id: 'tag-2', name: 'api' },
      ];
      mockEntryTagsRepo.getTagsForEntry.mockResolvedValue(mockTags);

      const result = await tagHandlers.forEntry(mockContext, {
        agentId: 'agent-1',
        entryType: 'knowledge',
        entryId: 'k-1',
      });

      expect(result.tags).toEqual(mockTags);
    });

    it('should check read permission', async () => {
      mockEntryTagsRepo.getTagsForEntry.mockResolvedValue([]);

      await tagHandlers.forEntry(mockContext, {
        agentId: 'agent-1',
        entryType: 'guideline',
        entryId: 'g-1',
      });

      expect(entryAccessUtil.requireEntryPermissionWithScope).toHaveBeenCalledWith(
        mockContext,
        expect.objectContaining({
          action: 'read',
          entryType: 'guideline',
          entryId: 'g-1',
        })
      );
    });
  });
});
