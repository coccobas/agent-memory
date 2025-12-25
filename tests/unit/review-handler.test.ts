import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reviewHandlers } from '../../src/mcp/handlers/review.handler.js';
import type { AppContext } from '../../src/core/context.js';

describe('Review Handler', () => {
  let mockContext: AppContext;
  let mockGuidelineRepo: {
    list: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    deactivate: ReturnType<typeof vi.fn>;
  };
  let mockKnowledgeRepo: {
    list: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    deactivate: ReturnType<typeof vi.fn>;
  };
  let mockToolRepo: {
    list: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    deactivate: ReturnType<typeof vi.fn>;
  };
  let mockEntryTagsRepo: {
    getTagsForEntry: ReturnType<typeof vi.fn>;
    detach: ReturnType<typeof vi.fn>;
  };
  let mockTagsRepo: {
    getByName: ReturnType<typeof vi.fn>;
  };
  let mockSessionsRepo: {
    getById: ReturnType<typeof vi.fn>;
  };
  let mockProjectsRepo: {
    getById: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGuidelineRepo = {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn(),
      create: vi.fn(),
      deactivate: vi.fn(),
    };
    mockKnowledgeRepo = {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn(),
      create: vi.fn(),
      deactivate: vi.fn(),
    };
    mockToolRepo = {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn(),
      create: vi.fn(),
      deactivate: vi.fn(),
    };
    mockEntryTagsRepo = {
      getTagsForEntry: vi.fn().mockResolvedValue([]),
      detach: vi.fn(),
    };
    mockTagsRepo = {
      getByName: vi.fn(),
    };
    mockSessionsRepo = {
      getById: vi.fn(),
    };
    mockProjectsRepo = {
      getById: vi.fn(),
    };
    mockContext = {
      db: {} as any,
      repos: {
        guidelines: mockGuidelineRepo,
        knowledge: mockKnowledgeRepo,
        tools: mockToolRepo,
        entryTags: mockEntryTagsRepo,
        tags: mockTagsRepo,
        sessions: mockSessionsRepo,
        projects: mockProjectsRepo,
      } as any,
      services: {} as any,
    };
  });

  describe('list', () => {
    it('should list candidates from session', async () => {
      mockGuidelineRepo.list.mockResolvedValue([
        { id: 'g-1', name: 'Test Guideline', isActive: true, currentVersion: { content: 'Content' } },
      ]);
      mockEntryTagsRepo.getTagsForEntry.mockResolvedValue([{ name: 'candidate' }]);
      mockSessionsRepo.getById.mockResolvedValue({ id: 'sess-1', projectId: 'proj-1' });
      mockProjectsRepo.getById.mockResolvedValue({ id: 'proj-1', name: 'Test Project' });

      const result = await reviewHandlers.list(mockContext, { sessionId: 'sess-1' });

      expect(result.success).toBe(true);
      expect(result.candidates.length).toBe(1);
      expect(result.projectId).toBe('proj-1');
    });

    it('should throw when sessionId is missing', async () => {
      await expect(reviewHandlers.list(mockContext, {} as any)).rejects.toThrow();
    });

    it('should return empty when no candidates', async () => {
      mockSessionsRepo.getById.mockResolvedValue({ id: 'sess-1' });

      const result = await reviewHandlers.list(mockContext, { sessionId: 'sess-1' });

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });

    it('should find candidates with needs_review tag', async () => {
      mockKnowledgeRepo.list.mockResolvedValue([
        { id: 'k-1', title: 'Test Knowledge', isActive: true, currentVersion: { content: 'Content' } },
      ]);
      mockEntryTagsRepo.getTagsForEntry.mockResolvedValue([{ name: 'needs_review' }]);
      mockSessionsRepo.getById.mockResolvedValue({ id: 'sess-1' });

      const result = await reviewHandlers.list(mockContext, { sessionId: 'sess-1' });

      expect(result.candidates.length).toBe(1);
    });
  });

  describe('show', () => {
    it('should show candidate details', async () => {
      mockGuidelineRepo.list.mockResolvedValue([
        { id: 'g-1', name: 'Test', isActive: true, currentVersion: { content: 'Full content here' } },
      ]);
      mockEntryTagsRepo.getTagsForEntry.mockResolvedValue([{ name: 'candidate' }]);

      const result = await reviewHandlers.show(mockContext, {
        sessionId: 'sess-1',
        entryId: 'g-1',
      });

      expect(result.success).toBe(true);
      expect(result.entry.content).toBe('Full content here');
    });

    it('should throw when sessionId is missing', async () => {
      await expect(
        reviewHandlers.show(mockContext, { entryId: 'g-1' } as any)
      ).rejects.toThrow();
    });

    it('should return failure for non-existent entry', async () => {
      const result = await reviewHandlers.show(mockContext, {
        sessionId: 'sess-1',
        entryId: 'nonexistent',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('approve', () => {
    it('should approve guideline and promote to project', async () => {
      mockGuidelineRepo.list.mockResolvedValue([
        { id: 'g-1', name: 'Test', isActive: true, currentVersion: { content: 'Content' } },
      ]);
      mockEntryTagsRepo.getTagsForEntry.mockResolvedValue([{ name: 'candidate' }]);
      mockSessionsRepo.getById.mockResolvedValue({ projectId: 'proj-1' });
      mockGuidelineRepo.getById.mockResolvedValue({
        id: 'g-1',
        name: 'Test',
        currentVersion: { content: 'Content' },
      });

      const result = await reviewHandlers.approve(mockContext, {
        sessionId: 'sess-1',
        entryId: 'g-1',
      });

      expect(result.success).toBe(true);
      expect(mockGuidelineRepo.create).toHaveBeenCalled();
      expect(mockGuidelineRepo.deactivate).toHaveBeenCalled();
    });

    it('should throw when projectId cannot be determined', async () => {
      mockGuidelineRepo.list.mockResolvedValue([
        { id: 'g-1', name: 'Test', isActive: true, currentVersion: { content: '' } },
      ]);
      mockEntryTagsRepo.getTagsForEntry.mockResolvedValue([{ name: 'candidate' }]);
      mockSessionsRepo.getById.mockResolvedValue({});

      await expect(
        reviewHandlers.approve(mockContext, { sessionId: 'sess-1', entryId: 'g-1' })
      ).rejects.toThrow('projectId');
    });

    it('should return failure for non-existent entry', async () => {
      mockSessionsRepo.getById.mockResolvedValue({ projectId: 'proj-1' });

      const result = await reviewHandlers.approve(mockContext, {
        sessionId: 'sess-1',
        entryId: 'nonexistent',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('reject', () => {
    it('should reject and deactivate entry', async () => {
      mockGuidelineRepo.list.mockResolvedValue([
        { id: 'g-1', name: 'Test', isActive: true, currentVersion: { content: '' } },
      ]);
      mockEntryTagsRepo.getTagsForEntry.mockResolvedValue([{ name: 'candidate' }]);

      const result = await reviewHandlers.reject(mockContext, {
        sessionId: 'sess-1',
        entryId: 'g-1',
      });

      expect(result.success).toBe(true);
      expect(mockGuidelineRepo.deactivate).toHaveBeenCalledWith('g-1');
    });

    it('should throw when entryId is missing', async () => {
      await expect(
        reviewHandlers.reject(mockContext, { sessionId: 'sess-1' } as any)
      ).rejects.toThrow();
    });
  });

  describe('skip', () => {
    it('should remove review tags', async () => {
      mockGuidelineRepo.list.mockResolvedValue([
        { id: 'g-1', name: 'Test', isActive: true, currentVersion: { content: '' } },
      ]);
      mockEntryTagsRepo.getTagsForEntry.mockResolvedValue([{ name: 'candidate' }]);
      mockTagsRepo.getByName.mockResolvedValue({ id: 'tag-1' });

      const result = await reviewHandlers.skip(mockContext, {
        sessionId: 'sess-1',
        entryId: 'g-1',
      });

      expect(result.success).toBe(true);
      expect(mockEntryTagsRepo.detach).toHaveBeenCalled();
    });

    it('should handle missing tags gracefully', async () => {
      mockGuidelineRepo.list.mockResolvedValue([
        { id: 'g-1', name: 'Test', isActive: true, currentVersion: { content: '' } },
      ]);
      mockEntryTagsRepo.getTagsForEntry.mockResolvedValue([{ name: 'candidate' }]);
      mockTagsRepo.getByName.mockResolvedValue(null);

      const result = await reviewHandlers.skip(mockContext, {
        sessionId: 'sess-1',
        entryId: 'g-1',
      });

      expect(result.success).toBe(true);
    });
  });
});
