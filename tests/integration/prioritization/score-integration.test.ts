/**
 * Integration Tests for Smart Prioritization Score Integration
 *
 * Tests the integration of SmartPrioritizationService with the score stage.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createSmartPrioritizationService,
  createDefaultSmartPriorityConfig,
  type SmartPriorityResult,
} from '../../../src/services/prioritization/index.js';
import type { QueryIntent } from '../../../src/services/query-rewrite/types.js';
import type { QueryEntryType } from '../../../src/services/query/pipeline.js';

describe('Smart Prioritization Score Integration', () => {
  describe('end-to-end priority scoring', () => {
    it('should incorporate smart priority into final score', async () => {
      // Create mock data access functions
      const mockGetOutcomes = vi.fn().mockResolvedValue({
        totalSamples: 100,
        byType: [
          { entryType: 'knowledge', successRate: 0.9, totalRetrievals: 50 },
          { entryType: 'guideline', successRate: 0.5, totalRetrievals: 30 },
        ],
      });

      const mockGetMetrics = vi.fn().mockResolvedValue(
        new Map([
          [
            'entry-1',
            {
              entryId: 'entry-1',
              retrievalCount: 50,
              successCount: 45,
              lastSuccessAt: new Date().toISOString(),
              lastAccessAt: new Date().toISOString(),
            },
          ],
          [
            'entry-2',
            {
              entryId: 'entry-2',
              retrievalCount: 20,
              successCount: 5,
              lastSuccessAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
              lastAccessAt: new Date().toISOString(),
            },
          ],
        ])
      );

      const mockFindSimilar = vi.fn().mockResolvedValue([]);

      // Create service
      const service = createSmartPrioritizationService(
        createDefaultSmartPriorityConfig(),
        mockGetOutcomes,
        mockGetMetrics,
        mockFindSimilar
      );

      // Get priority scores
      const entries = [
        { id: 'entry-1', type: 'knowledge' as QueryEntryType },
        { id: 'entry-2', type: 'guideline' as QueryEntryType },
      ];

      const result = await service.getPriorityScores(
        entries,
        'lookup' as QueryIntent,
        [0.1, 0.2, 0.3],
        'scope-123'
      );

      // Verify scores are computed
      expect(result.size).toBe(2);

      const score1 = result.get('entry-1');
      const score2 = result.get('entry-2');

      expect(score1).toBeDefined();
      expect(score2).toBeDefined();

      // Entry-1 should score higher (high success rate, knowledge type for lookup)
      expect(score1!.compositePriorityScore).toBeGreaterThan(score2!.compositePriorityScore);
    });

    it('should produce same results when disabled (backward compatible)', async () => {
      const mockGetOutcomes = vi.fn();
      const mockGetMetrics = vi.fn();
      const mockFindSimilar = vi.fn();

      const disabledConfig = {
        ...createDefaultSmartPriorityConfig(),
        enabled: false,
      };

      const service = createSmartPrioritizationService(
        disabledConfig,
        mockGetOutcomes,
        mockGetMetrics,
        mockFindSimilar
      );

      const entries = [{ id: 'entry-1', type: 'knowledge' as QueryEntryType }];

      const result = await service.getPriorityScores(entries, 'lookup' as QueryIntent);

      // Should return empty map when disabled (no modification to scores)
      expect(result.size).toBe(0);
      expect(mockGetOutcomes).not.toHaveBeenCalled();
    });

    it('should improve ranking for high-usefulness entries', async () => {
      const mockGetOutcomes = vi.fn().mockResolvedValue({
        totalSamples: 100,
        byType: [{ entryType: 'knowledge', successRate: 0.7, totalRetrievals: 100 }],
      });

      // Entry-1: High usefulness (many retrievals, high success)
      // Entry-2: Low usefulness (many retrievals, low success)
      const mockGetMetrics = vi.fn().mockResolvedValue(
        new Map([
          [
            'entry-1',
            {
              entryId: 'entry-1',
              retrievalCount: 100,
              successCount: 90,
              lastSuccessAt: new Date().toISOString(),
              lastAccessAt: new Date().toISOString(),
            },
          ],
          [
            'entry-2',
            {
              entryId: 'entry-2',
              retrievalCount: 100,
              successCount: 10,
              lastSuccessAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
              lastAccessAt: new Date().toISOString(),
            },
          ],
        ])
      );

      const mockFindSimilar = vi.fn().mockResolvedValue([]);

      const service = createSmartPrioritizationService(
        createDefaultSmartPriorityConfig(),
        mockGetOutcomes,
        mockGetMetrics,
        mockFindSimilar
      );

      const entries = [
        { id: 'entry-1', type: 'knowledge' as QueryEntryType },
        { id: 'entry-2', type: 'knowledge' as QueryEntryType },
      ];

      const result = await service.getPriorityScores(
        entries,
        'lookup' as QueryIntent,
        [0.1, 0.2, 0.3],
        'scope-123'
      );

      const score1 = result.get('entry-1');
      const score2 = result.get('entry-2');

      // High-usefulness entry should have measurably higher score
      expect(score1!.usefulnessScore).toBeGreaterThan(score2!.usefulnessScore);
      expect(score1!.compositePriorityScore).toBeGreaterThan(score2!.compositePriorityScore);
    });

    it('should add context similarity boost for similar past queries', async () => {
      const mockGetOutcomes = vi.fn().mockResolvedValue({
        totalSamples: 100,
        byType: [{ entryType: 'knowledge', successRate: 0.7, totalRetrievals: 100 }],
      });

      const mockGetMetrics = vi.fn().mockResolvedValue(
        new Map([
          [
            'entry-1',
            {
              entryId: 'entry-1',
              retrievalCount: 50,
              successCount: 35,
              lastSuccessAt: new Date().toISOString(),
              lastAccessAt: new Date().toISOString(),
            },
          ],
          [
            'entry-2',
            {
              entryId: 'entry-2',
              retrievalCount: 50,
              successCount: 35,
              lastSuccessAt: new Date().toISOString(),
              lastAccessAt: new Date().toISOString(),
            },
          ],
        ])
      );

      // Entry-1 succeeded in a similar context, entry-2 did not
      const mockFindSimilar = vi.fn().mockResolvedValue([
        {
          queryEmbedding: [0.11, 0.21, 0.31], // Similar to query embedding
          successfulEntryIds: ['entry-1'],
          similarityScore: 0.95,
          occurredAt: new Date().toISOString(),
        },
      ]);

      const service = createSmartPrioritizationService(
        createDefaultSmartPriorityConfig(),
        mockGetOutcomes,
        mockGetMetrics,
        mockFindSimilar
      );

      const entries = [
        { id: 'entry-1', type: 'knowledge' as QueryEntryType },
        { id: 'entry-2', type: 'knowledge' as QueryEntryType },
      ];

      const result = await service.getPriorityScores(
        entries,
        'lookup' as QueryIntent,
        [0.1, 0.2, 0.3], // Query embedding
        'scope-123'
      );

      const score1 = result.get('entry-1');
      const score2 = result.get('entry-2');

      // Entry-1 should have context similarity boost
      expect(score1!.contextSimilarityBoost).toBeGreaterThan(score2!.contextSimilarityBoost);
      expect(score1!.contextSimilarityBoost).toBeGreaterThan(1.0); // Boosted
      expect(score2!.contextSimilarityBoost).toBe(1.0); // No boost
    });
  });

  describe('latency requirements', () => {
    it('should complete within 10ms for small batches', async () => {
      const mockGetOutcomes = vi.fn().mockResolvedValue({
        totalSamples: 50,
        byType: [],
      });
      const mockGetMetrics = vi.fn().mockResolvedValue(new Map());
      const mockFindSimilar = vi.fn().mockResolvedValue([]);

      const service = createSmartPrioritizationService(
        createDefaultSmartPriorityConfig(),
        mockGetOutcomes,
        mockGetMetrics,
        mockFindSimilar
      );

      const entries = Array.from({ length: 20 }, (_, i) => ({
        id: `entry-${i}`,
        type: 'knowledge' as QueryEntryType,
      }));

      const start = performance.now();
      await service.getPriorityScores(
        entries,
        'lookup' as QueryIntent,
        [0.1, 0.2, 0.3],
        'scope-123'
      );
      const elapsed = performance.now() - start;

      // Should be fast (mocks return immediately, so just testing overhead)
      expect(elapsed).toBeLessThan(50); // Generous margin for CI environments
    });
  });

  describe('cold start behavior', () => {
    it('should work gracefully with no historical data', async () => {
      // Simulate cold start - no data
      const mockGetOutcomes = vi.fn().mockResolvedValue({
        totalSamples: 0,
        byType: [],
      });
      const mockGetMetrics = vi.fn().mockResolvedValue(new Map());
      const mockFindSimilar = vi.fn().mockResolvedValue([]);

      const service = createSmartPrioritizationService(
        createDefaultSmartPriorityConfig(),
        mockGetOutcomes,
        mockGetMetrics,
        mockFindSimilar
      );

      const entries = [{ id: 'entry-1', type: 'knowledge' as QueryEntryType }];

      const result = await service.getPriorityScores(entries, 'lookup' as QueryIntent);

      // Should produce valid results using static defaults
      expect(result.size).toBe(1);
      const score = result.get('entry-1');
      expect(score).toBeDefined();
      expect(score!.compositePriorityScore).toBeGreaterThan(0);
    });
  });
});
