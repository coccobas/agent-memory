/**
 * Tests for Prioritization Repository
 *
 * TDD: Tests written first to define expected behavior.
 *
 * The repository provides data access for:
 * - Outcome data aggregation by intent and type
 * - Usefulness metrics for entries
 * - Similar successful query contexts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PrioritizationRepository,
  createPrioritizationRepository,
} from '../../../../src/services/prioritization/repositories/prioritization.repository.js';
import type { OutcomeAggregation } from '../../../../src/services/prioritization/calculators/adaptive-weights.calculator.js';
import type {
  UsefulnessMetrics,
  SuccessfulContext,
} from '../../../../src/services/prioritization/types.js';

// Mock DrizzleDb interface
interface MockDb {
  select: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  leftJoin: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
}

function createMockDb(): MockDb {
  const mockDb: MockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue([]),
  };
  return mockDb;
}

describe('Prioritization Repository', () => {
  let repository: PrioritizationRepository;
  let mockDb: MockDb;

  beforeEach(() => {
    mockDb = createMockDb();
    repository = new PrioritizationRepository(mockDb as never);
  });

  describe('getOutcomesByIntentAndType', () => {
    it('should aggregate outcomes by intent and type', async () => {
      mockDb.all.mockResolvedValue([
        {
          entryType: 'knowledge',
          totalRetrievals: 50,
          successCount: 40,
          partialCount: 5,
          failureCount: 5,
        },
        {
          entryType: 'guideline',
          totalRetrievals: 30,
          successCount: 20,
          partialCount: 5,
          failureCount: 5,
        },
      ]);

      const result = await repository.getOutcomesByIntentAndType('lookup', 'scope-123', 30);

      expect(result.totalSamples).toBe(80);
      expect(result.byType).toHaveLength(2);
      expect(result.byType[0]).toMatchObject({
        entryType: 'knowledge',
        totalRetrievals: 50,
        successRate: 0.85, // (40 + 5*0.5) / 50 - partial counts as half
      });
    });

    it('should respect lookback window', async () => {
      mockDb.all.mockResolvedValue([]);

      await repository.getOutcomesByIntentAndType('lookup', 'scope-123', 30);

      // Should filter by date
      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should return empty aggregation when no data', async () => {
      mockDb.all.mockResolvedValue([]);

      const result = await repository.getOutcomesByIntentAndType('lookup', 'scope-123', 30);

      expect(result.totalSamples).toBe(0);
      expect(result.byType).toHaveLength(0);
    });

    it('should calculate success rate correctly', async () => {
      mockDb.all.mockResolvedValue([
        {
          entryType: 'knowledge',
          totalRetrievals: 100,
          successCount: 75,
          partialCount: 15, // Partial counts as half success
          failureCount: 10,
        },
      ]);

      const result = await repository.getOutcomesByIntentAndType('lookup', 'scope-123', 30);

      // Success rate = (75 + 0.5 * 15) / 100 = 0.825
      expect(result.byType[0]?.successRate).toBeCloseTo(0.825);
    });
  });

  describe('getUsefulnessMetrics', () => {
    it('should return metrics for requested entries', async () => {
      mockDb.all.mockResolvedValue([
        {
          entryId: 'entry-1',
          retrievalCount: 50,
          successCount: 40,
          lastSuccessAt: '2024-01-15T10:00:00Z',
          lastAccessAt: '2024-01-16T10:00:00Z',
        },
        {
          entryId: 'entry-2',
          retrievalCount: 10,
          successCount: 5,
          lastSuccessAt: '2024-01-14T10:00:00Z',
          lastAccessAt: '2024-01-15T10:00:00Z',
        },
      ]);

      const result = await repository.getUsefulnessMetrics(['entry-1', 'entry-2']);

      expect(result.size).toBe(2);
      expect(result.get('entry-1')).toMatchObject({
        entryId: 'entry-1',
        retrievalCount: 50,
        successCount: 40,
      });
    });

    it('should batch query efficiently', async () => {
      mockDb.all.mockResolvedValue([]);

      await repository.getUsefulnessMetrics(['entry-1', 'entry-2', 'entry-3']);

      // Should call all() only once with IN clause
      expect(mockDb.all).toHaveBeenCalledTimes(1);
    });

    it('should return empty map for empty input', async () => {
      const result = await repository.getUsefulnessMetrics([]);

      expect(result.size).toBe(0);
      expect(mockDb.all).not.toHaveBeenCalled();
    });

    it('should handle missing entries gracefully', async () => {
      mockDb.all.mockResolvedValue([
        {
          entryId: 'entry-1',
          retrievalCount: 50,
          successCount: 40,
          lastSuccessAt: '2024-01-15T10:00:00Z',
          lastAccessAt: '2024-01-16T10:00:00Z',
        },
        // entry-2 not in results
      ]);

      const result = await repository.getUsefulnessMetrics(['entry-1', 'entry-2']);

      expect(result.size).toBe(1);
      expect(result.has('entry-1')).toBe(true);
      expect(result.has('entry-2')).toBe(false);
    });
  });

  describe('findSimilarSuccessfulContexts', () => {
    it('should find contexts above similarity threshold', async () => {
      // Mock returns raw DB rows - the repo parses query_embedding JSON
      mockDb.all.mockResolvedValue([
        {
          queryEmbedding: JSON.stringify([0.1, 0.2, 0.3]),
          entryId: 'entry-1',
          retrievedAt: '2024-01-15T10:00:00Z',
        },
        {
          queryEmbedding: JSON.stringify([0.1, 0.2, 0.3]),
          entryId: 'entry-2',
          retrievedAt: '2024-01-15T10:00:00Z',
        },
      ]);

      const result = await repository.findSimilarSuccessfulContexts(
        [0.1, 0.2, 0.3], // Same as stored - should have similarity 1.0
        0.7,
        50
      );

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]?.similarityScore).toBeGreaterThan(0.7);
    });

    it('should respect max results limit', async () => {
      mockDb.all.mockResolvedValue([]);

      await repository.findSimilarSuccessfulContexts([0.1, 0.2], 0.7, 25);

      // Implementation fetches maxResults * 10 to filter by similarity in-memory
      expect(mockDb.limit).toHaveBeenCalledWith(250);
    });

    it('should only return successful outcomes', async () => {
      mockDb.all.mockResolvedValue([
        {
          queryEmbedding: JSON.stringify([0.1, 0.2, 0.3]),
          entryId: 'entry-1',
          retrievedAt: '2024-01-15T10:00:00Z',
        },
      ]);

      const result = await repository.findSimilarSuccessfulContexts([0.1, 0.2, 0.3], 0.7, 50);

      // Query filters for successful outcomes via the join
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]?.successfulEntryIds.length).toBeGreaterThan(0);
    });

    it('should return empty array when no similar contexts', async () => {
      mockDb.all.mockResolvedValue([]);

      const result = await repository.findSimilarSuccessfulContexts(
        [0.1, 0.2, 0.3],
        0.9, // High threshold
        50
      );

      expect(result).toHaveLength(0);
    });

    it('should handle empty embedding', async () => {
      const result = await repository.findSimilarSuccessfulContexts(
        [], // Empty embedding
        0.7,
        50
      );

      expect(result).toHaveLength(0);
      expect(mockDb.all).not.toHaveBeenCalled();
    });
  });

  describe('createPrioritizationRepository', () => {
    it('should create repository instance', () => {
      const repo = createPrioritizationRepository(mockDb as never);

      expect(repo).toBeInstanceOf(PrioritizationRepository);
    });
  });
});
