/**
 * Tests for ContextManagerService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ContextManagerService,
  createContextManagerService,
  type ContextEntry,
  type ContextRequest,
  type ContextManagerConfig,
  DEFAULT_CONTEXT_MANAGER_CONFIG,
} from '../../../src/services/context/context-manager.service.js';
import type { SmartPrioritizationService } from '../../../src/services/prioritization/smart-prioritization.service.js';
import type { SmartPriorityResult } from '../../../src/services/prioritization/types.js';

describe('ContextManagerService', () => {
  let service: ContextManagerService;
  let mockPrioritizationService: SmartPrioritizationService;

  beforeEach(() => {
    // Create mock prioritization service
    mockPrioritizationService = {
      getPriorityScores: vi.fn().mockResolvedValue(new Map()),
    } as unknown as SmartPrioritizationService;

    service = createContextManagerService(mockPrioritizationService, null);
  });

  describe('process', () => {
    it('should process entries through the full pipeline', async () => {
      const entries: ContextEntry[] = [
        {
          id: '1',
          type: 'guideline',
          title: 'Style Guide',
          content: 'Use consistent naming conventions',
          priority: 5,
          relevanceScore: 0.8,
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          type: 'knowledge',
          title: 'API Reference',
          content: 'The API uses REST endpoints',
          priority: 3,
          relevanceScore: 0.7,
          createdAt: new Date().toISOString(),
        },
      ];

      const mockScores = new Map<string, SmartPriorityResult>([
        [
          '1',
          {
            entryId: '1',
            entryType: 'guideline',
            compositePriorityScore: 0.8,
            adaptiveWeight: 1,
            usefulnessScore: 0.8,
            contextSimilarityBoost: 1,
          },
        ],
        [
          '2',
          {
            entryId: '2',
            entryType: 'knowledge',
            compositePriorityScore: 0.7,
            adaptiveWeight: 1,
            usefulnessScore: 0.7,
            contextSimilarityBoost: 1,
          },
        ],
      ]);
      vi.mocked(mockPrioritizationService.getPriorityScores).mockResolvedValue(mockScores);

      const request: ContextRequest = {
        entries,
        intent: 'lookup',
        format: 'markdown',
      };

      const result = await service.process(request);

      expect(result.content).toBeTruthy();
      expect(result.includedEntries).toHaveLength(2);
      expect(result.excludedEntries).toHaveLength(0);
      expect(result.stalenessWarnings).toHaveLength(0);
      expect(result.budget).toBeDefined();
      expect(result.stats.inputEntryCount).toBe(2);
      expect(result.stats.outputEntryCount).toBe(2);
    });

    it('should detect and warn about stale entries', async () => {
      const entries: ContextEntry[] = [
        {
          id: 'old-entry',
          type: 'knowledge',
          title: 'Old Knowledge',
          content: 'This is outdated information',
          createdAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(), // 120 days ago
        },
      ];

      const mockScores = new Map<string, SmartPriorityResult>([
        [
          'old-entry',
          {
            entryId: 'old-entry',
            entryType: 'knowledge',
            compositePriorityScore: 0.5,
            adaptiveWeight: 1,
            usefulnessScore: 0.5,
            contextSimilarityBoost: 1,
          },
        ],
      ]);
      vi.mocked(mockPrioritizationService.getPriorityScores).mockResolvedValue(mockScores);

      const request: ContextRequest = {
        entries,
        intent: 'lookup',
      };

      const result = await service.process(request);

      expect(result.stalenessWarnings).toHaveLength(1);
      expect(result.stalenessWarnings[0].reason).toBe('old_age');
      expect(result.stats.staleEntryCount).toBe(1);
    });

    it('should exclude stale entries when configured', async () => {
      const config: Partial<ContextManagerConfig> = {
        staleness: {
          excludeFromInjection: true,
          staleAgeDays: 30,
        },
      };
      const customService = createContextManagerService(mockPrioritizationService, null, config);

      const entries: ContextEntry[] = [
        {
          id: 'fresh',
          type: 'guideline',
          content: 'Fresh content',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'stale',
          type: 'knowledge',
          content: 'Stale content',
          createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago
        },
      ];

      const mockScores = new Map<string, SmartPriorityResult>([
        [
          'fresh',
          {
            entryId: 'fresh',
            entryType: 'guideline',
            compositePriorityScore: 0.8,
            adaptiveWeight: 1,
            usefulnessScore: 0.8,
            contextSimilarityBoost: 1,
          },
        ],
      ]);
      vi.mocked(mockPrioritizationService.getPriorityScores).mockResolvedValue(mockScores);

      const result = await customService.process({ entries });

      expect(result.includedEntries).toHaveLength(1);
      expect(result.includedEntries[0].id).toBe('fresh');
      expect(result.excludedEntries.some((e) => e.id === 'stale')).toBe(true);
    });

    it('should calculate budget based on intent complexity', async () => {
      const entries: ContextEntry[] = [{ id: '1', type: 'guideline', content: 'Content' }];

      const mockScores = new Map<string, SmartPriorityResult>([
        [
          '1',
          {
            entryId: '1',
            entryType: 'guideline',
            compositePriorityScore: 0.5,
            adaptiveWeight: 1,
            usefulnessScore: 0.5,
            contextSimilarityBoost: 1,
          },
        ],
      ]);
      vi.mocked(mockPrioritizationService.getPriorityScores).mockResolvedValue(mockScores);

      // Simple intent (lookup)
      const simpleResult = await service.process({ entries, intent: 'lookup' });

      // Complex intent (debug)
      const complexResult = await service.process({ entries, intent: 'debug' });

      expect(complexResult.budget.totalBudget).toBeGreaterThan(simpleResult.budget.totalBudget);
      expect(complexResult.budget.complexity).toBe('complex');
      expect(simpleResult.budget.complexity).toBe('simple');
    });

    it('should compress entries when exceeding budget', async () => {
      const entries: ContextEntry[] = Array.from({ length: 20 }, (_, i) => ({
        id: `entry-${i}`,
        type: 'knowledge' as const,
        title: `Entry ${i}`,
        content: 'A'.repeat(500),
        priority: i,
      }));

      const mockScores = new Map<string, SmartPriorityResult>(
        entries.map((e) => [
          e.id,
          {
            entryId: e.id,
            entryType: 'knowledge',
            compositePriorityScore: (e.priority ?? 0) / 20,
            adaptiveWeight: 1,
            usefulnessScore: 0.5,
            contextSimilarityBoost: 1,
          },
        ])
      );
      vi.mocked(mockPrioritizationService.getPriorityScores).mockResolvedValue(mockScores);

      const result = await service.process({
        entries,
        maxTokens: 200, // Very low budget to force compression
      });

      expect(result.compressionLevel).not.toBe('none');
      expect(result.stats.compressionRatio).toBeLessThan(1.0);
    });

    it('should respect maxEntries limit', async () => {
      const entries: ContextEntry[] = Array.from({ length: 10 }, (_, i) => ({
        id: `entry-${i}`,
        type: 'guideline' as const,
        content: 'Short content',
        priority: 10 - i, // Higher priority first
      }));

      const mockScores = new Map<string, SmartPriorityResult>(
        entries.map((e) => [
          e.id,
          {
            entryId: e.id,
            entryType: 'guideline',
            compositePriorityScore: (e.priority ?? 0) / 10,
            adaptiveWeight: 1,
            usefulnessScore: 0.5,
            contextSimilarityBoost: 1,
          },
        ])
      );
      vi.mocked(mockPrioritizationService.getPriorityScores).mockResolvedValue(mockScores);

      const result = await service.process({
        entries,
        maxEntries: 3,
      });

      expect(result.includedEntries.length).toBeLessThanOrEqual(3);
    });

    it('should format output as JSON when requested', async () => {
      const entries: ContextEntry[] = [
        { id: '1', type: 'guideline', title: 'Test', content: 'Content' },
      ];

      const mockScores = new Map<string, SmartPriorityResult>([
        [
          '1',
          {
            entryId: '1',
            entryType: 'guideline',
            compositePriorityScore: 0.5,
            adaptiveWeight: 1,
            usefulnessScore: 0.5,
            contextSimilarityBoost: 1,
          },
        ],
      ]);
      vi.mocked(mockPrioritizationService.getPriorityScores).mockResolvedValue(mockScores);

      const result = await service.process({
        entries,
        format: 'json',
      });

      expect(() => JSON.parse(result.content)).not.toThrow();
      expect(result.content).toContain('memoryContext');
    });

    it('should passthrough when disabled', async () => {
      const config: Partial<ContextManagerConfig> = {
        enabled: false,
      };
      const disabledService = createContextManagerService(mockPrioritizationService, null, config);

      const entries: ContextEntry[] = [
        {
          id: '1',
          type: 'guideline',
          content: 'Content',
          createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(), // Old entry
        },
      ];

      const result = await disabledService.process({ entries });

      // Should not check staleness
      expect(result.stalenessWarnings).toHaveLength(0);
      expect(result.stats.staleEntryCount).toBe(0);

      // Should not prioritize
      expect(mockPrioritizationService.getPriorityScores).not.toHaveBeenCalled();

      // Should include all entries
      expect(result.includedEntries).toHaveLength(1);
      expect(result.compressionLevel).toBe('none');
    });

    it('should track processing statistics', async () => {
      const entries: ContextEntry[] = [
        { id: '1', type: 'guideline', content: 'Content 1', relevanceScore: 0.9 },
        { id: '2', type: 'knowledge', content: 'Content 2', relevanceScore: 0.8 },
      ];

      const mockScores = new Map<string, SmartPriorityResult>([
        [
          '1',
          {
            entryId: '1',
            entryType: 'guideline',
            compositePriorityScore: 0.9,
            adaptiveWeight: 1,
            usefulnessScore: 0.9,
            contextSimilarityBoost: 1,
          },
        ],
        [
          '2',
          {
            entryId: '2',
            entryType: 'knowledge',
            compositePriorityScore: 0.8,
            adaptiveWeight: 1,
            usefulnessScore: 0.8,
            contextSimilarityBoost: 1,
          },
        ],
      ]);
      vi.mocked(mockPrioritizationService.getPriorityScores).mockResolvedValue(mockScores);

      const result = await service.process({ entries });

      expect(result.stats).toMatchObject({
        inputEntryCount: 2,
        outputEntryCount: 2,
        staleEntryCount: 0,
      });
      expect(result.stats.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.stats.originalTokens).toBeGreaterThan(0);
      expect(result.stats.finalTokens).toBeGreaterThan(0);
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = service.getConfig();

      expect(config.enabled).toBe(DEFAULT_CONTEXT_MANAGER_CONFIG.enabled);
      expect(config.staleness).toEqual(DEFAULT_CONTEXT_MANAGER_CONFIG.staleness);
      expect(config.budget).toEqual(DEFAULT_CONTEXT_MANAGER_CONFIG.budget);
    });
  });

  describe('component access', () => {
    it('should provide access to budget calculator', () => {
      const calculator = service.getBudgetCalculator();

      expect(calculator).toBeDefined();
      expect(calculator.calculate).toBeDefined();
    });

    it('should provide access to stale detector', () => {
      const detector = service.getStaleDetector();

      expect(detector).toBeDefined();
      expect(detector.analyze).toBeDefined();
    });

    it('should provide access to priority integration', () => {
      const priority = service.getPriorityIntegration();

      expect(priority).toBeDefined();
      expect(priority.prioritize).toBeDefined();
    });

    it('should provide access to compression manager', () => {
      const compression = service.getCompressionManager();

      expect(compression).toBeDefined();
      expect(compression.compress).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty entries array', async () => {
      const result = await service.process({ entries: [] });

      expect(result.includedEntries).toHaveLength(0);
      expect(result.excludedEntries).toHaveLength(0);
      expect(result.stats.inputEntryCount).toBe(0);
      expect(result.stats.outputEntryCount).toBe(0);
    });

    it('should handle entries without dates', async () => {
      const entries: ContextEntry[] = [{ id: '1', type: 'guideline', content: 'No date content' }];

      const mockScores = new Map<string, SmartPriorityResult>([
        [
          '1',
          {
            entryId: '1',
            entryType: 'guideline',
            compositePriorityScore: 0.5,
            adaptiveWeight: 1,
            usefulnessScore: 0.5,
            contextSimilarityBoost: 1,
          },
        ],
      ]);
      vi.mocked(mockPrioritizationService.getPriorityScores).mockResolvedValue(mockScores);

      const result = await service.process({ entries });

      expect(result.includedEntries).toHaveLength(1);
      expect(result.stalenessWarnings).toHaveLength(0); // No date means not stale
    });

    it('should handle prioritization service returning empty map', async () => {
      vi.mocked(mockPrioritizationService.getPriorityScores).mockResolvedValue(new Map());

      const entries: ContextEntry[] = [
        { id: '1', type: 'guideline', content: 'Content', relevanceScore: 0.8 },
      ];

      const result = await service.process({ entries });

      // Should fall back to relevance score
      expect(result.includedEntries).toHaveLength(1);
    });

    it('should handle null prioritization service', async () => {
      const serviceWithoutPrioritization = createContextManagerService(null, null);

      const entries: ContextEntry[] = [
        { id: '1', type: 'guideline', content: 'Content', relevanceScore: 0.9 },
        { id: '2', type: 'knowledge', content: 'Content 2', relevanceScore: 0.7 },
      ];

      const result = await serviceWithoutPrioritization.process({ entries });

      // Should still process and sort by relevance
      expect(result.includedEntries).toHaveLength(2);
    });
  });

  describe('natural language format', () => {
    it('should format output as natural language', async () => {
      const entries: ContextEntry[] = [
        {
          id: '1',
          type: 'guideline',
          title: 'Naming Convention',
          content: 'Use camelCase for variables',
        },
      ];

      const mockScores = new Map<string, SmartPriorityResult>([
        [
          '1',
          {
            entryId: '1',
            entryType: 'guideline',
            compositePriorityScore: 0.8,
            adaptiveWeight: 1,
            usefulnessScore: 0.8,
            contextSimilarityBoost: 1,
          },
        ],
      ]);
      vi.mocked(mockPrioritizationService.getPriorityScores).mockResolvedValue(mockScores);

      const result = await service.process({
        entries,
        format: 'natural_language',
      });

      expect(result.content).toContain('Follow this guideline');
    });
  });
});
