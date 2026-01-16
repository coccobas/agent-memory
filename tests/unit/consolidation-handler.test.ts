import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleConsolidation } from '../../src/mcp/handlers/consolidation.handler.js';
import * as consolidationService from '../../src/services/consolidation.service.js';
import type { AppContext } from '../../src/core/context.js';

vi.mock('../../src/services/consolidation.service.js', () => ({
  consolidate: vi.fn(),
  findSimilarGroups: vi.fn(),
  archiveStale: vi.fn(),
}));

describe('Consolidation Handler', () => {
  let mockContext: AppContext;
  let mockEmbeddingService: { embed: ReturnType<typeof vi.fn> };
  let mockVectorService: { searchSimilar: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbeddingService = { embed: vi.fn() };
    mockVectorService = { searchSimilar: vi.fn() };
    mockContext = {
      db: {} as any,
      repos: {} as any,
      services: {
        embedding: mockEmbeddingService,
        vector: mockVectorService,
      } as any,
    };
  });

  describe('find_similar', () => {
    it('should find similar entry groups', async () => {
      vi.mocked(consolidationService.findSimilarGroups).mockResolvedValue([
        {
          primaryId: 'g-1',
          primaryName: 'Guideline 1',
          entryType: 'guideline',
          averageSimilarity: 0.9,
          members: [{ id: 'g-2', name: 'Similar Guideline', similarity: 0.9 }],
        },
      ]);

      const result = await handleConsolidation(mockContext, {
        action: 'find_similar',
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(result.action).toBe('find_similar');
      expect(result.groupsFound).toBe(1);
      expect(result.groups).toHaveLength(1);
    });

    it('should return empty groups when no similar entries', async () => {
      vi.mocked(consolidationService.findSimilarGroups).mockResolvedValue([]);

      const result = await handleConsolidation(mockContext, {
        action: 'find_similar',
        scopeType: 'global',
      });

      expect(result.groupsFound).toBe(0);
      expect(result.hint).toContain('No similar entries');
    });

    it('should respect threshold parameter', async () => {
      vi.mocked(consolidationService.findSimilarGroups).mockResolvedValue([]);

      await handleConsolidation(mockContext, {
        action: 'find_similar',
        scopeType: 'project',
        scopeId: 'proj-1',
        threshold: 0.95,
      });

      expect(consolidationService.findSimilarGroups).toHaveBeenCalledWith(
        expect.objectContaining({ threshold: 0.95 })
      );
    });

    it('should filter by entry types', async () => {
      vi.mocked(consolidationService.findSimilarGroups).mockResolvedValue([]);

      await handleConsolidation(mockContext, {
        action: 'find_similar',
        scopeType: 'project',
        scopeId: 'proj-1',
        entryTypes: ['guideline', 'knowledge'],
      });

      expect(consolidationService.findSimilarGroups).toHaveBeenCalledWith(
        expect.objectContaining({
          entryTypes: ['guideline', 'knowledge'],
        })
      );
    });
  });

  describe('dedupe', () => {
    it('should deduplicate similar entries', async () => {
      vi.mocked(consolidationService.consolidate).mockResolvedValue({
        strategy: 'dedupe',
        dryRun: false,
        groupsFound: 2,
        entriesProcessed: 4,
        entriesMerged: 0,
        entriesDeactivated: 2,
        errors: [],
        groups: [],
      });

      const result = await handleConsolidation(mockContext, {
        action: 'dedupe',
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(result.action).toBe('dedupe');
      expect(result.strategy).toBe('dedupe');
      expect(result.entriesDeactivated).toBe(2);
    });

    it('should support dry run', async () => {
      vi.mocked(consolidationService.consolidate).mockResolvedValue({
        strategy: 'dedupe',
        dryRun: true,
        groupsFound: 1,
        entriesProcessed: 2,
        entriesMerged: 0,
        entriesDeactivated: 1,
        errors: [],
        groups: [],
      });

      const result = await handleConsolidation(mockContext, {
        action: 'dedupe',
        scopeType: 'project',
        scopeId: 'proj-1',
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.message).toContain('Would consolidate');
    });
  });

  describe('merge', () => {
    it('should merge similar entries', async () => {
      vi.mocked(consolidationService.consolidate).mockResolvedValue({
        strategy: 'semantic_merge',
        dryRun: false,
        groupsFound: 1,
        entriesProcessed: 3,
        entriesMerged: 2,
        entriesDeactivated: 2,
        errors: [],
        groups: [
          {
            primaryId: 'g-1',
            primaryName: 'Merged Guideline',
            entryType: 'guideline',
            averageSimilarity: 0.88,
            members: [],
          },
        ],
      });

      const result = await handleConsolidation(mockContext, {
        action: 'merge',
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(result.action).toBe('merge');
      expect(result.strategy).toBe('semantic_merge');
      expect(result.entriesMerged).toBe(2);
    });
  });

  describe('abstract', () => {
    it('should create relations between similar entries', async () => {
      vi.mocked(consolidationService.consolidate).mockResolvedValue({
        strategy: 'abstract',
        dryRun: false,
        groupsFound: 1,
        entriesProcessed: 2,
        entriesMerged: 0,
        entriesDeactivated: 0,
        errors: [],
        groups: [],
      });

      const result = await handleConsolidation(mockContext, {
        action: 'abstract',
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(result.action).toBe('abstract');
      expect(result.strategy).toBe('abstract');
    });
  });

  describe('archive_stale', () => {
    it('should archive stale entries', async () => {
      vi.mocked(consolidationService.archiveStale).mockResolvedValue({
        dryRun: false,
        staleDays: 90,
        minRecencyScore: undefined,
        entriesScanned: 100,
        entriesArchived: 15,
        errors: [],
        archivedEntries: [],
      });

      const result = await handleConsolidation(mockContext, {
        action: 'archive_stale',
        scopeType: 'project',
        scopeId: 'proj-1',
        staleDays: 90,
      });

      expect(result.action).toBe('archive_stale');
      expect(result.entriesArchived).toBe(15);
    });

    it('should require staleDays', async () => {
      await expect(
        handleConsolidation(mockContext, {
          action: 'archive_stale',
          scopeType: 'project',
          scopeId: 'proj-1',
        })
      ).rejects.toThrow('staleDays');
    });

    it('should support dry run', async () => {
      vi.mocked(consolidationService.archiveStale).mockResolvedValue({
        dryRun: true,
        staleDays: 60,
        entriesScanned: 50,
        entriesArchived: 10,
        errors: [],
        archivedEntries: [],
      });

      const result = await handleConsolidation(mockContext, {
        action: 'archive_stale',
        scopeType: 'project',
        scopeId: 'proj-1',
        staleDays: 60,
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.message).toContain('Would archive');
    });

    it('should support minRecencyScore filter', async () => {
      vi.mocked(consolidationService.archiveStale).mockResolvedValue({
        dryRun: false,
        staleDays: 30,
        minRecencyScore: 0.3,
        entriesScanned: 100,
        entriesArchived: 5,
        errors: [],
        archivedEntries: [],
      });

      await handleConsolidation(mockContext, {
        action: 'archive_stale',
        scopeType: 'project',
        scopeId: 'proj-1',
        staleDays: 30,
        minRecencyScore: 0.3,
      });

      expect(consolidationService.archiveStale).toHaveBeenCalledWith(
        expect.objectContaining({ minRecencyScore: 0.3 })
      );
    });

    it('should validate minRecencyScore range', async () => {
      await expect(
        handleConsolidation(mockContext, {
          action: 'archive_stale',
          scopeType: 'project',
          scopeId: 'proj-1',
          staleDays: 30,
          minRecencyScore: 1.5,
        })
      ).rejects.toThrow('between 0 and 1');
    });
  });

  describe('validation', () => {
    it('should throw on invalid action', async () => {
      await expect(
        handleConsolidation(mockContext, {
          action: 'invalid' as any,
          scopeType: 'project',
        })
      ).rejects.toThrow('action');
    });

    it('should throw on missing scopeType', async () => {
      await expect(
        handleConsolidation(mockContext, {
          action: 'find_similar',
        } as any)
      ).rejects.toThrow('scopeType');
    });

    it('should throw on missing scopeId for non-global scope', async () => {
      await expect(
        handleConsolidation(mockContext, {
          action: 'find_similar',
          scopeType: 'project',
        })
      ).rejects.toThrow('scopeId');
    });

    it('should allow global scope without scopeId', async () => {
      vi.mocked(consolidationService.findSimilarGroups).mockResolvedValue([]);

      const result = await handleConsolidation(mockContext, {
        action: 'find_similar',
        scopeType: 'global',
      });

      expect(result).toBeDefined();
    });

    it('should validate threshold range', async () => {
      await expect(
        handleConsolidation(mockContext, {
          action: 'find_similar',
          scopeType: 'global',
          threshold: 1.5,
        })
      ).rejects.toThrow('between 0 and 1');
    });

    it('should throw when services not initialized', async () => {
      mockContext.services = {} as any;

      await expect(
        handleConsolidation(mockContext, {
          action: 'find_similar',
          scopeType: 'global',
        })
      ).rejects.toThrow('services');
    });
  });
});
