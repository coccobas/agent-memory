/**
 * Tests for PriorityIntegrationService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PriorityIntegrationService,
  createPriorityIntegrationService,
  type PrioritizableEntry,
  type PriorityIntegrationConfig,
  DEFAULT_PRIORITY_INTEGRATION_CONFIG,
} from '../../../src/services/context/priority-integration.js';
import type { SmartPrioritizationService } from '../../../src/services/prioritization/smart-prioritization.service.js';
import type { SmartPriorityResult } from '../../../src/services/prioritization/types.js';

describe('PriorityIntegrationService', () => {
  let service: PriorityIntegrationService;
  let mockPrioritizationService: SmartPrioritizationService;

  beforeEach(() => {
    // Create mock prioritization service
    mockPrioritizationService = {
      getPriorityScores: vi.fn().mockResolvedValue(new Map()),
    } as unknown as SmartPrioritizationService;

    service = createPriorityIntegrationService(mockPrioritizationService);
  });

  describe('prioritize', () => {
    it('should return entries sorted by composite score', async () => {
      const entries: PrioritizableEntry[] = [
        { id: '1', type: 'guideline', relevanceScore: 0.5 },
        { id: '2', type: 'knowledge', relevanceScore: 0.9 },
        { id: '3', type: 'tool', relevanceScore: 0.7 },
      ];

      // Mock returns higher scores for entry 2
      const mockScores = new Map<string, SmartPriorityResult>([
        [
          '1',
          {
            entryId: '1',
            entryType: 'guideline',
            compositePriorityScore: 0.4,
            adaptiveWeight: 1,
            usefulnessScore: 0.5,
            contextSimilarityBoost: 1,
          },
        ],
        [
          '2',
          {
            entryId: '2',
            entryType: 'knowledge',
            compositePriorityScore: 0.9,
            adaptiveWeight: 1,
            usefulnessScore: 0.9,
            contextSimilarityBoost: 1.2,
          },
        ],
        [
          '3',
          {
            entryId: '3',
            entryType: 'tool',
            compositePriorityScore: 0.6,
            adaptiveWeight: 1,
            usefulnessScore: 0.6,
            contextSimilarityBoost: 1,
          },
        ],
      ]);
      vi.mocked(mockPrioritizationService.getPriorityScores).mockResolvedValue(mockScores);

      const result = await service.prioritize(entries, 'lookup');

      // Should be sorted by composite score (descending)
      expect(result.entries[0].id).toBe('2');
      expect(result.entries[1].id).toBe('3');
      expect(result.entries[2].id).toBe('1');
    });

    it('should exclude entries below minimum score', async () => {
      const config: Partial<PriorityIntegrationConfig> = {
        minScore: 0.5,
      };
      const customService = createPriorityIntegrationService(mockPrioritizationService, config);

      const entries: PrioritizableEntry[] = [
        { id: 'high', type: 'guideline', relevanceScore: 0.9 },
        { id: 'low', type: 'knowledge', relevanceScore: 0.2 },
      ];

      const mockScores = new Map<string, SmartPriorityResult>([
        [
          'high',
          {
            entryId: 'high',
            entryType: 'guideline',
            compositePriorityScore: 0.8,
            adaptiveWeight: 1,
            usefulnessScore: 0.8,
            contextSimilarityBoost: 1,
          },
        ],
        [
          'low',
          {
            entryId: 'low',
            entryType: 'knowledge',
            compositePriorityScore: 0.2,
            adaptiveWeight: 1,
            usefulnessScore: 0.2,
            contextSimilarityBoost: 1,
          },
        ],
      ]);
      vi.mocked(mockPrioritizationService.getPriorityScores).mockResolvedValue(mockScores);

      const result = await customService.prioritize(entries, 'lookup');

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].id).toBe('high');
      expect(result.excluded).toHaveLength(1);
      expect(result.excluded[0].id).toBe('low');
    });

    it('should attach priority result to entries', async () => {
      const entries: PrioritizableEntry[] = [{ id: '1', type: 'guideline', relevanceScore: 0.7 }];

      const mockScores = new Map<string, SmartPriorityResult>([
        [
          '1',
          {
            entryId: '1',
            entryType: 'guideline',
            compositePriorityScore: 0.75,
            adaptiveWeight: 1.2,
            usefulnessScore: 0.8,
            contextSimilarityBoost: 1.1,
          },
        ],
      ]);
      vi.mocked(mockPrioritizationService.getPriorityScores).mockResolvedValue(mockScores);

      const result = await service.prioritize(entries, 'lookup');

      expect(result.entries[0].priorityResult).toBeDefined();
      expect(result.entries[0].priorityResult?.adaptiveWeight).toBe(1.2);
      expect(result.entries[0].priorityResult?.usefulnessScore).toBe(0.8);
    });

    it('should fall back to relevance sorting when service unavailable', async () => {
      const serviceWithoutPrioritization = createPriorityIntegrationService(null);

      const entries: PrioritizableEntry[] = [
        { id: '1', type: 'guideline', relevanceScore: 0.5 },
        { id: '2', type: 'knowledge', relevanceScore: 0.9 },
        { id: '3', type: 'tool', relevanceScore: 0.7 },
      ];

      const result = await serviceWithoutPrioritization.prioritize(entries, 'lookup');

      // Should be sorted by relevance score (descending)
      expect(result.entries[0].id).toBe('2');
      expect(result.entries[1].id).toBe('3');
      expect(result.entries[2].id).toBe('1');
      expect(result.stats.totalExcluded).toBe(0);
    });

    it('should fall back gracefully when prioritization fails', async () => {
      vi.mocked(mockPrioritizationService.getPriorityScores).mockRejectedValue(
        new Error('Service unavailable')
      );

      const entries: PrioritizableEntry[] = [{ id: '1', type: 'guideline', relevanceScore: 0.7 }];

      const result = await service.prioritize(entries, 'lookup');

      // Should return entries with relevance-based sorting
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].compositePriorityScore).toBe(0.7); // Falls back to relevance
    });

    it('should skip prioritization when disabled', async () => {
      const config: Partial<PriorityIntegrationConfig> = {
        enabled: false,
      };
      const disabledService = createPriorityIntegrationService(mockPrioritizationService, config);

      const entries: PrioritizableEntry[] = [{ id: '1', type: 'guideline', relevanceScore: 0.5 }];

      const result = await disabledService.prioritize(entries, 'lookup');

      // Should not call prioritization service
      expect(mockPrioritizationService.getPriorityScores).not.toHaveBeenCalled();
      expect(result.entries).toHaveLength(1);
    });

    it('should calculate statistics correctly', async () => {
      const entries: PrioritizableEntry[] = [
        { id: '1', type: 'guideline', relevanceScore: 0.8 },
        { id: '2', type: 'knowledge', relevanceScore: 0.9 },
      ];

      const mockScores = new Map<string, SmartPriorityResult>([
        [
          '1',
          {
            entryId: '1',
            entryType: 'guideline',
            compositePriorityScore: 0.7,
            adaptiveWeight: 1,
            usefulnessScore: 0.7,
            contextSimilarityBoost: 1,
          },
        ],
        [
          '2',
          {
            entryId: '2',
            entryType: 'knowledge',
            compositePriorityScore: 0.9,
            adaptiveWeight: 1,
            usefulnessScore: 0.9,
            contextSimilarityBoost: 1,
          },
        ],
      ]);
      vi.mocked(mockPrioritizationService.getPriorityScores).mockResolvedValue(mockScores);

      const result = await service.prioritize(entries, 'lookup');

      expect(result.stats.totalInput).toBe(2);
      expect(result.stats.totalPrioritized).toBe(2);
      expect(result.stats.avgPriorityScore).toBeGreaterThan(0);
      expect(result.stats.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getTopPrioritized', () => {
    it('should return top N entries by priority', async () => {
      const entries: PrioritizableEntry[] = [
        { id: '1', type: 'guideline', relevanceScore: 0.5 },
        { id: '2', type: 'knowledge', relevanceScore: 0.9 },
        { id: '3', type: 'tool', relevanceScore: 0.7 },
        { id: '4', type: 'experience', relevanceScore: 0.6 },
      ];

      const mockScores = new Map<string, SmartPriorityResult>([
        [
          '1',
          {
            entryId: '1',
            entryType: 'guideline',
            compositePriorityScore: 0.4,
            adaptiveWeight: 1,
            usefulnessScore: 0.5,
            contextSimilarityBoost: 1,
          },
        ],
        [
          '2',
          {
            entryId: '2',
            entryType: 'knowledge',
            compositePriorityScore: 0.9,
            adaptiveWeight: 1,
            usefulnessScore: 0.9,
            contextSimilarityBoost: 1,
          },
        ],
        [
          '3',
          {
            entryId: '3',
            entryType: 'tool',
            compositePriorityScore: 0.6,
            adaptiveWeight: 1,
            usefulnessScore: 0.6,
            contextSimilarityBoost: 1,
          },
        ],
        [
          '4',
          {
            entryId: '4',
            entryType: 'experience',
            compositePriorityScore: 0.5,
            adaptiveWeight: 1,
            usefulnessScore: 0.5,
            contextSimilarityBoost: 1,
          },
        ],
      ]);
      vi.mocked(mockPrioritizationService.getPriorityScores).mockResolvedValue(mockScores);

      const topEntries = await service.getTopPrioritized(entries, 2, 'lookup');

      expect(topEntries).toHaveLength(2);
      expect(topEntries[0].id).toBe('2'); // Highest score
      expect(topEntries[1].id).toBe('3'); // Second highest
    });
  });

  describe('getOverfetchCount', () => {
    it('should return multiplied count when enabled', () => {
      const count = service.getOverfetchCount(5);

      expect(count).toBe(Math.ceil(5 * DEFAULT_PRIORITY_INTEGRATION_CONFIG.overfetchMultiplier));
    });

    it('should return original count when disabled', () => {
      const config: Partial<PriorityIntegrationConfig> = {
        enabled: false,
      };
      const disabledService = createPriorityIntegrationService(null, config);

      const count = disabledService.getOverfetchCount(5);

      expect(count).toBe(5);
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = service.getConfig();

      expect(config.enabled).toBe(DEFAULT_PRIORITY_INTEGRATION_CONFIG.enabled);
      expect(config.minScore).toBe(DEFAULT_PRIORITY_INTEGRATION_CONFIG.minScore);
      expect(config.smartPriorityWeight).toBe(
        DEFAULT_PRIORITY_INTEGRATION_CONFIG.smartPriorityWeight
      );
    });
  });

  describe('composite score calculation', () => {
    it('should boost score based on explicit priority', async () => {
      const entries: PrioritizableEntry[] = [
        { id: 'high-priority', type: 'guideline', priority: 10, relevanceScore: 0.5 },
        { id: 'low-priority', type: 'guideline', priority: 1, relevanceScore: 0.5 },
      ];

      const mockScores = new Map<string, SmartPriorityResult>([
        [
          'high-priority',
          {
            entryId: 'high-priority',
            entryType: 'guideline',
            compositePriorityScore: 0.5,
            adaptiveWeight: 1,
            usefulnessScore: 0.5,
            contextSimilarityBoost: 1,
          },
        ],
        [
          'low-priority',
          {
            entryId: 'low-priority',
            entryType: 'guideline',
            compositePriorityScore: 0.5,
            adaptiveWeight: 1,
            usefulnessScore: 0.5,
            contextSimilarityBoost: 1,
          },
        ],
      ]);
      vi.mocked(mockPrioritizationService.getPriorityScores).mockResolvedValue(mockScores);

      const result = await service.prioritize(entries, 'lookup');

      // High priority entry should have higher composite score
      const highEntry = result.entries.find((e) => e.id === 'high-priority');
      const lowEntry = result.entries.find((e) => e.id === 'low-priority');

      expect(highEntry?.compositePriorityScore).toBeGreaterThan(
        lowEntry?.compositePriorityScore ?? 0
      );
    });
  });
});
