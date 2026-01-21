/**
 * Tests for Smart Prioritization Service
 *
 * TDD: Tests written first to define expected behavior.
 *
 * The service orchestrates three calculators:
 * - AdaptiveWeightsCalculator
 * - UsefulnessCalculator
 * - ContextSimilarityCalculator
 *
 * And combines their results with configurable weights.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SmartPrioritizationService,
  createSmartPrioritizationService,
} from '../../../src/services/prioritization/smart-prioritization.service.js';
import type {
  SmartPriorityConfig,
  SmartPriorityResult,
  AdaptiveTypeWeights,
} from '../../../src/services/prioritization/types.js';
import { createDefaultSmartPriorityConfig } from '../../../src/services/prioritization/types.js';
import type { QueryEntryType } from '../../../src/services/query/pipeline.js';
import type { QueryIntent } from '../../../src/services/query-rewrite/types.js';

describe('Smart Prioritization Service', () => {
  let service: SmartPrioritizationService;
  let mockAdaptiveCalc: {
    calculateWeights: ReturnType<typeof vi.fn>;
    getStaticWeights: ReturnType<typeof vi.fn>;
  };
  let mockUsefulnessCalc: {
    calculateScores: ReturnType<typeof vi.fn>;
  };
  let mockContextCalc: {
    calculateBoosts: ReturnType<typeof vi.fn>;
  };
  let config: SmartPriorityConfig;

  const defaultAdaptiveWeights: AdaptiveTypeWeights = {
    guideline: 1.0,
    knowledge: 1.15,
    tool: 0.95,
    experience: 0.9,
  };

  beforeEach(() => {
    config = createDefaultSmartPriorityConfig();

    mockAdaptiveCalc = {
      calculateWeights: vi.fn().mockResolvedValue(defaultAdaptiveWeights),
      getStaticWeights: vi.fn().mockReturnValue(defaultAdaptiveWeights),
    };

    mockUsefulnessCalc = {
      calculateScores: vi.fn().mockResolvedValue(
        new Map([
          ['entry-1', 0.8],
          ['entry-2', 0.5],
        ])
      ),
    };

    mockContextCalc = {
      calculateBoosts: vi.fn().mockResolvedValue(
        new Map([
          ['entry-1', 1.1],
          ['entry-2', 1.0],
        ])
      ),
    };

    service = new SmartPrioritizationService(
      config,
      mockAdaptiveCalc as never,
      mockUsefulnessCalc as never,
      mockContextCalc as never
    );
  });

  describe('getPriorityScores', () => {
    it('should return scores for all entries', async () => {
      const entries = [
        { id: 'entry-1', type: 'knowledge' as QueryEntryType },
        { id: 'entry-2', type: 'guideline' as QueryEntryType },
      ];

      const result = await service.getPriorityScores(
        entries,
        'lookup' as QueryIntent,
        [0.1, 0.2],
        'scope-123'
      );

      expect(result.size).toBe(2);
      expect(result.has('entry-1')).toBe(true);
      expect(result.has('entry-2')).toBe(true);
    });

    it('should initialize sub-calculators by calling them', async () => {
      const entries = [{ id: 'entry-1', type: 'knowledge' as QueryEntryType }];

      await service.getPriorityScores(entries, 'lookup' as QueryIntent, [0.1, 0.2], 'scope-123');

      expect(mockAdaptiveCalc.calculateWeights).toHaveBeenCalledWith('lookup', 'scope-123');
      expect(mockUsefulnessCalc.calculateScores).toHaveBeenCalledWith(['entry-1']);
      expect(mockContextCalc.calculateBoosts).toHaveBeenCalledWith([0.1, 0.2], ['entry-1']);
    });

    it('should batch DB queries efficiently (parallel calls)', async () => {
      const entries = [
        { id: 'entry-1', type: 'knowledge' as QueryEntryType },
        { id: 'entry-2', type: 'guideline' as QueryEntryType },
      ];

      await service.getPriorityScores(entries, 'lookup' as QueryIntent, [0.1, 0.2], 'scope-123');

      // All three calculators should be called
      expect(mockAdaptiveCalc.calculateWeights).toHaveBeenCalledTimes(1);
      expect(mockUsefulnessCalc.calculateScores).toHaveBeenCalledTimes(1);
      expect(mockContextCalc.calculateBoosts).toHaveBeenCalledTimes(1);
    });

    it('should skip disabled components', async () => {
      const disabledConfig = {
        ...config,
        adaptiveWeights: { ...config.adaptiveWeights, enabled: false },
        usefulness: { ...config.usefulness, enabled: false },
        contextSimilarity: { ...config.contextSimilarity, enabled: false },
      };

      const disabledService = new SmartPrioritizationService(
        disabledConfig,
        mockAdaptiveCalc as never,
        mockUsefulnessCalc as never,
        mockContextCalc as never
      );

      const entries = [{ id: 'entry-1', type: 'knowledge' as QueryEntryType }];

      const result = await disabledService.getPriorityScores(
        entries,
        'lookup' as QueryIntent,
        [0.1, 0.2],
        'scope-123'
      );

      // Should still return results (using defaults)
      expect(result.size).toBe(1);
    });

    it('should work with cold start (no data)', async () => {
      // Simulate cold start - no feedback data
      mockUsefulnessCalc.calculateScores.mockResolvedValue(
        new Map([['entry-1', 0.5]]) // Neutral scores
      );
      mockContextCalc.calculateBoosts.mockResolvedValue(
        new Map([['entry-1', 1.0]]) // No boost
      );

      const entries = [{ id: 'entry-1', type: 'knowledge' as QueryEntryType }];

      const result = await service.getPriorityScores(
        entries,
        'lookup' as QueryIntent,
        [0.1, 0.2],
        'scope-123'
      );

      // Should still produce valid results
      expect(result.get('entry-1')).toBeDefined();
      const score = result.get('entry-1')!;
      expect(score.compositePriorityScore).toBeGreaterThan(0);
    });

    it('should combine scores with configured weights (0.4×A + 0.3×U + 0.3×S)', async () => {
      // Set up known values
      mockAdaptiveCalc.calculateWeights.mockResolvedValue({
        guideline: 1.0,
        knowledge: 1.2, // Known adaptive weight
        tool: 1.0,
        experience: 1.0,
      });
      mockUsefulnessCalc.calculateScores.mockResolvedValue(
        new Map([['entry-1', 0.8]]) // Known usefulness
      );
      mockContextCalc.calculateBoosts.mockResolvedValue(
        new Map([['entry-1', 1.1]]) // Known boost
      );

      const entries = [{ id: 'entry-1', type: 'knowledge' as QueryEntryType }];

      const result = await service.getPriorityScores(
        entries,
        'lookup' as QueryIntent,
        [0.1, 0.2],
        'scope-123'
      );

      const score = result.get('entry-1')!;

      // Expected: (1.2 × 0.4) + (0.8 × 0.3) + (1.1 × 0.3)
      // = 0.48 + 0.24 + 0.33 = 1.05
      expect(score.compositePriorityScore).toBeCloseTo(1.05);
      expect(score.adaptiveWeight).toBe(1.2);
      expect(score.usefulnessScore).toBe(0.8);
      expect(score.contextSimilarityBoost).toBe(1.1);
    });

    it('should return empty map for empty entries', async () => {
      const result = await service.getPriorityScores(
        [],
        'lookup' as QueryIntent,
        [0.1, 0.2],
        'scope-123'
      );

      expect(result.size).toBe(0);
    });

    it('should handle missing query embedding gracefully', async () => {
      mockContextCalc.calculateBoosts.mockResolvedValue(
        new Map([['entry-1', 1.0]]) // Neutral boost when no embedding
      );

      const entries = [{ id: 'entry-1', type: 'knowledge' as QueryEntryType }];

      const result = await service.getPriorityScores(
        entries,
        'lookup' as QueryIntent,
        undefined, // No embedding
        'scope-123'
      );

      expect(result.size).toBe(1);
    });

    it('should use static weights when adaptive calculator fails', async () => {
      mockAdaptiveCalc.calculateWeights.mockRejectedValue(new Error('DB error'));
      mockAdaptiveCalc.getStaticWeights.mockReturnValue(defaultAdaptiveWeights);

      const entries = [{ id: 'entry-1', type: 'knowledge' as QueryEntryType }];

      const result = await service.getPriorityScores(
        entries,
        'lookup' as QueryIntent,
        [0.1, 0.2],
        'scope-123'
      );

      // Should still return results using static weights
      expect(result.size).toBe(1);
      expect(result.get('entry-1')?.adaptiveWeight).toBe(defaultAdaptiveWeights.knowledge);
    });

    it('should return correct entry types in result', async () => {
      const entries = [
        { id: 'entry-1', type: 'knowledge' as QueryEntryType },
        { id: 'entry-2', type: 'guideline' as QueryEntryType },
      ];

      const result = await service.getPriorityScores(
        entries,
        'lookup' as QueryIntent,
        [0.1, 0.2],
        'scope-123'
      );

      expect(result.get('entry-1')?.entryType).toBe('knowledge');
      expect(result.get('entry-2')?.entryType).toBe('guideline');
    });
  });

  describe('when master switch is disabled', () => {
    it('should return empty map when service is disabled', async () => {
      const disabledConfig = { ...config, enabled: false };
      const disabledService = new SmartPrioritizationService(
        disabledConfig,
        mockAdaptiveCalc as never,
        mockUsefulnessCalc as never,
        mockContextCalc as never
      );

      const entries = [{ id: 'entry-1', type: 'knowledge' as QueryEntryType }];

      const result = await disabledService.getPriorityScores(
        entries,
        'lookup' as QueryIntent,
        [0.1, 0.2],
        'scope-123'
      );

      expect(result.size).toBe(0);
      expect(mockAdaptiveCalc.calculateWeights).not.toHaveBeenCalled();
    });
  });

  describe('createSmartPrioritizationService', () => {
    it('should create service with default config', () => {
      // Mock dependencies
      const mockGetOutcomes = vi.fn();
      const mockGetMetrics = vi.fn();
      const mockFindSimilar = vi.fn();

      const service = createSmartPrioritizationService(
        createDefaultSmartPriorityConfig(),
        mockGetOutcomes,
        mockGetMetrics,
        mockFindSimilar
      );

      expect(service).toBeInstanceOf(SmartPrioritizationService);
    });
  });
});
