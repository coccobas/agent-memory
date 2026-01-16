/**
 * Unit tests for consolidation orchestrator
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { consolidate } from '../../src/services/consolidation/orchestrator.js';
import * as discovery from '../../src/services/consolidation/discovery.js';
import * as strategies from '../../src/services/consolidation/strategies/index.js';
import type {
  SimilarityGroup,
  ConsolidationParams,
} from '../../src/services/consolidation/types.js';
import type { ConsolidationStrategy } from '../../src/services/consolidation/strategy.interface.js';

vi.mock('../../src/services/consolidation/discovery.js');
vi.mock('../../src/services/consolidation/strategies/index.js');

describe('Consolidation Orchestrator', () => {
  let mockDb: any;
  let mockServices: any;
  let mockStrategy: ConsolidationStrategy;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {};
    mockServices = {
      embedding: { isAvailable: vi.fn().mockReturnValue(true) },
      vector: {},
    };

    mockStrategy = {
      execute: vi.fn().mockReturnValue({
        success: true,
        entriesProcessed: 2,
        entriesMerged: 1,
        entriesDeactivated: 1,
        relationsCreated: 0,
      }),
    };

    vi.mocked(strategies.getStrategy).mockReturnValue(mockStrategy);
  });

  const createParams = (overrides: Partial<ConsolidationParams> = {}): ConsolidationParams => ({
    scopeType: 'project',
    scopeId: 'proj-123',
    strategy: 'dedupe',
    db: mockDb,
    services: mockServices,
    ...overrides,
  });

  describe('consolidate', () => {
    it('should return empty result when no similar groups found', async () => {
      vi.mocked(discovery.findSimilarGroups).mockResolvedValue([]);

      const result = await consolidate(createParams());

      expect(result.groupsFound).toBe(0);
      expect(result.entriesProcessed).toBe(0);
      expect(result.entriesMerged).toBe(0);
      expect(result.entriesDeactivated).toBe(0);
      expect(result.groups).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('should find and process similar groups', async () => {
      const mockGroups: SimilarityGroup[] = [
        {
          primaryId: 'entry-1',
          primaryName: 'Primary Entry',
          entryType: 'guideline',
          members: [
            { id: 'entry-2', name: 'Similar Entry', similarity: 0.9, createdAt: '2024-01-01' },
          ],
          averageSimilarity: 0.9,
        },
      ];

      vi.mocked(discovery.findSimilarGroups).mockResolvedValue(mockGroups);

      const result = await consolidate(createParams());

      expect(result.groupsFound).toBe(1);
      expect(result.groups).toEqual(mockGroups);
      expect(strategies.getStrategy).toHaveBeenCalledWith('dedupe');
      expect(mockStrategy.execute).toHaveBeenCalledWith(mockGroups[0], undefined, mockDb);
    });

    it('should use correct strategy based on params', async () => {
      vi.mocked(discovery.findSimilarGroups).mockResolvedValue([
        {
          primaryId: 'entry-1',
          primaryName: 'Entry',
          entryType: 'knowledge',
          members: [],
          averageSimilarity: 0.85,
        },
      ]);

      await consolidate(createParams({ strategy: 'semantic_merge' }));

      expect(strategies.getStrategy).toHaveBeenCalledWith('semantic_merge');
    });

    it('should pass threshold to findSimilarGroups', async () => {
      vi.mocked(discovery.findSimilarGroups).mockResolvedValue([]);

      await consolidate(createParams({ threshold: 0.9 }));

      expect(discovery.findSimilarGroups).toHaveBeenCalledWith(
        expect.objectContaining({ threshold: 0.9 })
      );
    });

    it('should only report without executing in dry run mode', async () => {
      const mockGroups: SimilarityGroup[] = [
        {
          primaryId: 'entry-1',
          primaryName: 'Entry 1',
          entryType: 'tool',
          members: [
            { id: 'entry-2', name: 'Entry 2', similarity: 0.88, createdAt: '2024-01-01' },
            { id: 'entry-3', name: 'Entry 3', similarity: 0.85, createdAt: '2024-01-02' },
          ],
          averageSimilarity: 0.865,
        },
      ];

      vi.mocked(discovery.findSimilarGroups).mockResolvedValue(mockGroups);

      const result = await consolidate(createParams({ dryRun: true }));

      expect(result.dryRun).toBe(true);
      expect(result.groupsFound).toBe(1);
      // 1 primary + 2 members = 3 entries
      expect(result.entriesProcessed).toBe(3);
      // Strategy should NOT be called in dry run
      expect(mockStrategy.execute).not.toHaveBeenCalled();
    });

    it('should aggregate results from multiple groups', async () => {
      const mockGroups: SimilarityGroup[] = [
        {
          primaryId: 'entry-1',
          primaryName: 'Entry 1',
          entryType: 'guideline',
          members: [{ id: 'entry-2', name: 'Entry 2', similarity: 0.9, createdAt: '2024-01-01' }],
          averageSimilarity: 0.9,
        },
        {
          primaryId: 'entry-3',
          primaryName: 'Entry 3',
          entryType: 'knowledge',
          members: [{ id: 'entry-4', name: 'Entry 4', similarity: 0.88, createdAt: '2024-01-01' }],
          averageSimilarity: 0.88,
        },
      ];

      vi.mocked(discovery.findSimilarGroups).mockResolvedValue(mockGroups);

      const result = await consolidate(createParams());

      expect(result.groupsFound).toBe(2);
      // 2 groups × 2 entries processed each
      expect(result.entriesProcessed).toBe(4);
      // 2 groups × 1 merged each
      expect(result.entriesMerged).toBe(2);
      // 2 groups × 1 deactivated each
      expect(result.entriesDeactivated).toBe(2);
    });

    it('should pass consolidatedBy to strategy', async () => {
      vi.mocked(discovery.findSimilarGroups).mockResolvedValue([
        {
          primaryId: 'entry-1',
          primaryName: 'Entry',
          entryType: 'tool',
          members: [],
          averageSimilarity: 0.9,
        },
      ]);

      await consolidate(createParams({ consolidatedBy: 'agent-123' }));

      expect(mockStrategy.execute).toHaveBeenCalledWith(expect.anything(), 'agent-123', mockDb);
    });

    it('should collect errors from failed strategy executions', async () => {
      const mockGroups: SimilarityGroup[] = [
        {
          primaryId: 'entry-1',
          primaryName: 'Entry 1',
          entryType: 'guideline',
          members: [],
          averageSimilarity: 0.9,
        },
      ];

      vi.mocked(discovery.findSimilarGroups).mockResolvedValue(mockGroups);
      vi.mocked(mockStrategy.execute).mockReturnValue({
        success: false,
        entriesProcessed: 0,
        entriesMerged: 0,
        entriesDeactivated: 0,
        relationsCreated: 0,
        error: 'Failed to merge entries',
      });

      const result = await consolidate(createParams());

      expect(result.errors).toContain('Failed to merge entries');
      expect(result.entriesProcessed).toBe(0);
    });

    it('should handle strategy execution throwing an error', async () => {
      const mockGroups: SimilarityGroup[] = [
        {
          primaryId: 'entry-1',
          primaryName: 'Entry 1',
          entryType: 'guideline',
          members: [],
          averageSimilarity: 0.9,
        },
      ];

      vi.mocked(discovery.findSimilarGroups).mockResolvedValue(mockGroups);
      vi.mocked(mockStrategy.execute).mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const result = await consolidate(createParams());

      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('entry-1');
      expect(result.errors[0]).toContain('Database connection failed');
    });

    it('should handle findSimilarGroups throwing an error', async () => {
      vi.mocked(discovery.findSimilarGroups).mockRejectedValue(
        new Error('Embedding service unavailable')
      );

      const result = await consolidate(createParams());

      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Embedding service unavailable');
      expect(result.groupsFound).toBe(0);
    });

    it('should continue processing remaining groups after one fails', async () => {
      const mockGroups: SimilarityGroup[] = [
        {
          primaryId: 'entry-1',
          primaryName: 'Entry 1',
          entryType: 'guideline',
          members: [],
          averageSimilarity: 0.9,
        },
        {
          primaryId: 'entry-2',
          primaryName: 'Entry 2',
          entryType: 'knowledge',
          members: [],
          averageSimilarity: 0.88,
        },
      ];

      vi.mocked(discovery.findSimilarGroups).mockResolvedValue(mockGroups);

      // First call throws, second succeeds
      vi.mocked(mockStrategy.execute)
        .mockImplementationOnce(() => {
          throw new Error('First group failed');
        })
        .mockReturnValueOnce({
          success: true,
          entriesProcessed: 1,
          entriesMerged: 0,
          entriesDeactivated: 0,
          relationsCreated: 0,
        });

      const result = await consolidate(createParams());

      expect(result.errors.length).toBe(1);
      expect(result.entriesProcessed).toBe(1); // Second group processed
      expect(mockStrategy.execute).toHaveBeenCalledTimes(2);
    });

    it('should use abstract strategy correctly', async () => {
      vi.mocked(discovery.findSimilarGroups).mockResolvedValue([
        {
          primaryId: 'entry-1',
          primaryName: 'Entry',
          entryType: 'guideline',
          members: [{ id: 'entry-2', name: 'Similar', similarity: 0.87, createdAt: '2024-01-01' }],
          averageSimilarity: 0.87,
        },
      ]);

      vi.mocked(mockStrategy.execute).mockReturnValue({
        success: true,
        entriesProcessed: 2,
        entriesMerged: 0,
        entriesDeactivated: 0,
        relationsCreated: 1,
      });

      const result = await consolidate(createParams({ strategy: 'abstract' }));

      expect(strategies.getStrategy).toHaveBeenCalledWith('abstract');
      expect(result.entriesProcessed).toBe(2);
    });

    it('should include strategy type in result', async () => {
      vi.mocked(discovery.findSimilarGroups).mockResolvedValue([]);

      const result = await consolidate(createParams({ strategy: 'semantic_merge' }));

      expect(result.strategy).toBe('semantic_merge');
    });

    it('should include dryRun flag in result', async () => {
      vi.mocked(discovery.findSimilarGroups).mockResolvedValue([]);

      const resultDry = await consolidate(createParams({ dryRun: true }));
      const resultReal = await consolidate(createParams({ dryRun: false }));

      expect(resultDry.dryRun).toBe(true);
      expect(resultReal.dryRun).toBe(false);
    });

    it('should handle non-Error objects thrown', async () => {
      vi.mocked(discovery.findSimilarGroups).mockRejectedValue('String error');

      const result = await consolidate(createParams());

      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('String error');
    });

    it('should handle strategy returning non-Error object in error field', async () => {
      const mockGroups: SimilarityGroup[] = [
        {
          primaryId: 'entry-1',
          primaryName: 'Entry',
          entryType: 'tool',
          members: [],
          averageSimilarity: 0.9,
        },
      ];

      vi.mocked(discovery.findSimilarGroups).mockResolvedValue(mockGroups);
      vi.mocked(mockStrategy.execute).mockImplementation(() => {
        throw 'Non-error string thrown';
      });

      const result = await consolidate(createParams());

      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Non-error string thrown');
    });

    it('should pass all params to findSimilarGroups', async () => {
      vi.mocked(discovery.findSimilarGroups).mockResolvedValue([]);

      await consolidate(
        createParams({
          scopeType: 'org',
          scopeId: 'org-456',
          entryTypes: ['guideline', 'knowledge'],
          threshold: 0.75,
          limit: 50,
        })
      );

      expect(discovery.findSimilarGroups).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeType: 'org',
          scopeId: 'org-456',
          entryTypes: ['guideline', 'knowledge'],
          threshold: 0.75,
          limit: 50,
        })
      );
    });
  });
});
