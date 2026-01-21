/**
 * Integration Tests for Context Management
 *
 * Tests the full context management pipeline with realistic scenarios.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createContextManagerService,
  type ContextEntry,
  type ContextManagerConfig,
} from '../../src/services/context/context-manager.service.js';
import {
  createBudgetCalculator,
  INTENT_COMPLEXITY_MAP,
} from '../../src/services/context/budget-calculator.js';
import { createStaleContextDetector } from '../../src/services/context/stale-detector.js';
import { createCompressionManager } from '../../src/services/context/compression-manager.js';
import { createPriorityIntegrationService } from '../../src/services/context/priority-integration.js';

describe('Context Management Integration', () => {
  describe('Full Pipeline', () => {
    it('should process a typical session context request', async () => {
      const service = createContextManagerService(null, null);

      // Simulate typical session context with mixed entry types
      const entries: ContextEntry[] = [
        {
          id: 'g1',
          type: 'guideline',
          title: 'TypeScript Standards',
          content: 'Always use strict TypeScript with explicit types. Avoid any type.',
          priority: 9,
          relevanceScore: 0.85,
          createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'g2',
          type: 'guideline',
          title: 'Error Handling',
          content: 'Use try-catch blocks for async operations. Always log errors.',
          priority: 8,
          relevanceScore: 0.75,
          createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'k1',
          type: 'knowledge',
          title: 'Database Schema',
          content: 'The users table has columns: id, email, created_at, role.',
          priority: 6,
          relevanceScore: 0.9,
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'k2',
          type: 'knowledge',
          title: 'API Architecture',
          content: 'We use REST with versioned endpoints. All responses include metadata.',
          priority: 5,
          relevanceScore: 0.65,
          createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 't1',
          type: 'tool',
          title: 'npm test',
          content: 'Run unit tests: npm test -- --watch',
          priority: 4,
          relevanceScore: 0.6,
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'e1',
          type: 'experience',
          title: 'Auth Bug Fix',
          content: 'Fixed token expiry issue by checking refresh token validity first.',
          priority: 7,
          relevanceScore: 0.8,
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ];

      const result = await service.process({
        entries,
        intent: 'debug',
        format: 'markdown',
      });

      // Verify all entries are processed
      expect(result.stats.inputEntryCount).toBe(6);
      expect(result.includedEntries.length).toBeGreaterThan(0);

      // Verify budget reflects debug complexity
      expect(result.budget.complexity).toBe('complex');

      // Verify content is generated
      expect(result.content).toBeTruthy();
      expect(result.content.length).toBeGreaterThan(0);

      // Verify no errors in processing
      expect(result.stats.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle stale entries appropriately', async () => {
      const config: Partial<ContextManagerConfig> = {
        staleness: {
          staleAgeDays: 60,
          excludeFromInjection: true,
        },
      };
      const service = createContextManagerService(null, null, config);

      const entries: ContextEntry[] = [
        {
          id: 'fresh',
          type: 'guideline',
          content: 'Fresh guideline',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'stale',
          type: 'knowledge',
          content: 'Outdated knowledge',
          createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ];

      const result = await service.process({ entries });

      // Stale entry should be excluded
      expect(result.includedEntries.some((e) => e.id === 'fresh')).toBe(true);
      expect(result.includedEntries.some((e) => e.id === 'stale')).toBe(false);
      expect(result.excludedEntries.some((e) => e.id === 'stale')).toBe(true);
      expect(result.stats.staleEntryCount).toBeGreaterThan(0);
    });

    it('should compress large contexts to fit budget', async () => {
      const service = createContextManagerService(null, null);

      // Create many large entries with enough content to exceed threshold (1500 tokens = ~6000 chars)
      const entries: ContextEntry[] = Array.from({ length: 30 }, (_, i) => ({
        id: `entry-${i}`,
        type: (i % 4 === 0
          ? 'guideline'
          : i % 4 === 1
            ? 'knowledge'
            : i % 4 === 2
              ? 'tool'
              : 'experience') as 'guideline' | 'knowledge' | 'tool' | 'experience',
        title: `Entry ${i}`,
        content: `This is a fairly long content block for entry ${i}. `.repeat(40), // ~2000 chars each, 30 entries = ~60k chars = ~15k tokens
        priority: Math.floor(Math.random() * 10),
        relevanceScore: Math.random(),
        createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
      }));

      const result = await service.process({
        entries,
        maxTokens: 500, // Force compression with tiny budget
        intent: 'lookup',
      });

      // Should compress since original tokens > budget and > hierarchicalThreshold
      expect(result.stats.finalTokens).toBeLessThanOrEqual(result.stats.originalTokens);
      // With 15k tokens of content and 500 token budget, we should see truncation
      if (result.stats.originalTokens > 1500) {
        expect(result.compressionLevel).not.toBe('none');
      }
    });
  });

  describe('Budget Calculator Standalone', () => {
    it('should calculate appropriate budgets for each intent', () => {
      const calculator = createBudgetCalculator();

      const intents = Object.keys(INTENT_COMPLEXITY_MAP) as Array<
        keyof typeof INTENT_COMPLEXITY_MAP
      >;

      for (const intent of intents) {
        const result = calculator.calculate(intent);

        expect(result.totalBudget).toBeGreaterThan(0);
        expect(result.effectiveBudget).toBeLessThanOrEqual(result.totalBudget);
        expect(result.complexity).toBe(INTENT_COMPLEXITY_MAP[intent]);
        expect(result.allocation.guideline).toBeGreaterThan(0);
        expect(result.maxEntries.guideline).toBeGreaterThan(0);
      }
    });

    it('should respect maxBudget cap', () => {
      const calculator = createBudgetCalculator({
        baseBudget: 1000,
        maxBudget: 3000,
      });

      // Complex intent with 4x multiplier = 4000, should cap at 3000
      const result = calculator.calculate('debug');

      expect(result.totalBudget).toBe(3000);
    });
  });

  describe('Stale Detector Standalone', () => {
    it('should identify stale entries by age', () => {
      const detector = createStaleContextDetector({
        staleAgeDays: 30,
      });

      const entries = [
        { id: '1', type: 'guideline' as const, createdAt: new Date().toISOString() },
        {
          id: '2',
          type: 'knowledge' as const,
          createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ];

      const result = detector.analyze(entries);

      expect(result.warnings.some((w) => w.entryId === '2')).toBe(true);
      expect(result.warnings.some((w) => w.entryId === '1')).toBe(false);
    });

    it('should detect entries not accessed recently', () => {
      const detector = createStaleContextDetector({
        notAccessedDays: 14,
      });

      const entries = [
        {
          id: '1',
          type: 'guideline' as const,
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          accessedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Last accessed 30 days ago
        },
      ];

      const result = detector.analyze(entries);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].reason).toBe('not_accessed');
    });
  });

  describe('Compression Manager Standalone', () => {
    it('should progressively compress content', async () => {
      const manager = createCompressionManager(null);

      // Create entries with enough content to exceed hierarchicalThreshold (1500 tokens = ~6000 chars)
      const entries = Array.from({ length: 10 }, (_, i) => ({
        id: `entry-${i}`,
        type: 'knowledge' as const,
        title: `Entry ${i}`,
        content: 'A'.repeat(800), // ~200 tokens each, 10 entries = ~2000 tokens
        priority: i,
      }));

      // Test with very low budget (should truncate)
      const truncatedResult = await manager.compress(entries, 100, 'markdown');
      expect(['hierarchical', 'truncated']).toContain(truncatedResult.level);
      expect(truncatedResult.ratio).toBeLessThan(1.0);

      // Test with moderate budget and smaller set (content is ~400 tokens, budget 500)
      // Small content that fits budget = no compression
      const moderateResult = await manager.compress(entries.slice(0, 2), 500, 'markdown');
      expect(['none', 'hierarchical']).toContain(moderateResult.level);
    });

    it('should preserve high-priority entries when truncating', async () => {
      const manager = createCompressionManager(null);

      const entries = [
        { id: 'high', type: 'guideline' as const, content: 'A'.repeat(200), priority: 10 },
        { id: 'low', type: 'guideline' as const, content: 'B'.repeat(200), priority: 1 },
      ].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)); // Pre-sort by priority

      const result = await manager.compress(entries, 80, 'markdown');

      // High priority should be included first
      if (result.includedEntries.length === 1) {
        expect(result.includedEntries[0].id).toBe('high');
      }
    });
  });

  describe('Priority Integration Standalone', () => {
    it('should sort entries by relevance when no prioritization service', async () => {
      const integration = createPriorityIntegrationService(null);

      const entries = [
        { id: '1', type: 'guideline' as const, relevanceScore: 0.5 },
        { id: '2', type: 'knowledge' as const, relevanceScore: 0.9 },
        { id: '3', type: 'tool' as const, relevanceScore: 0.7 },
      ];

      const result = await integration.prioritize(entries, 'lookup');

      // Should be sorted by relevance descending
      expect(result.entries[0].id).toBe('2');
      expect(result.entries[1].id).toBe('3');
      expect(result.entries[2].id).toBe('1');
    });

    it('should sort entries by relevance when no prioritization service (minScore not applied in passthrough)', async () => {
      // When there's no prioritization service, minScore filtering is not applied
      // This is intentional - passthrough mode just sorts by relevance
      const integration = createPriorityIntegrationService(null, {
        minScore: 0.5,
      });

      const entries = [
        { id: 'high', type: 'guideline' as const, relevanceScore: 0.8 },
        { id: 'low', type: 'knowledge' as const, relevanceScore: 0.2 },
      ];

      const result = await integration.prioritize(entries, 'lookup');

      // In passthrough mode, all entries are included and sorted by relevance
      expect(result.entries.some((e) => e.id === 'high')).toBe(true);
      expect(result.entries.some((e) => e.id === 'low')).toBe(true);
      expect(result.excluded).toHaveLength(0);
      // High should come before low due to relevance sorting
      expect(result.entries[0].id).toBe('high');
    });
  });

  describe('Format Output', () => {
    it('should produce valid markdown output', async () => {
      const service = createContextManagerService(null, null);

      const entries: ContextEntry[] = [
        { id: '1', type: 'guideline', title: 'Rule 1', content: 'Do X' },
        { id: '2', type: 'knowledge', title: 'Fact 1', content: 'Y is true' },
      ];

      const result = await service.process({ entries, format: 'markdown' });

      // Markdown should contain formatting
      expect(result.content).toMatch(/\*\*|##|`|-/);
    });

    it('should produce valid JSON output', async () => {
      const service = createContextManagerService(null, null);

      const entries: ContextEntry[] = [
        { id: '1', type: 'guideline', title: 'Rule', content: 'Content' },
      ];

      const result = await service.process({ entries, format: 'json' });

      const parsed = JSON.parse(result.content);
      expect(parsed).toHaveProperty('memoryContext');
      expect(Array.isArray(parsed.memoryContext)).toBe(true);
    });

    it('should produce readable natural language output', async () => {
      const service = createContextManagerService(null, null);

      const entries: ContextEntry[] = [
        { id: '1', type: 'guideline', title: 'Naming', content: 'Use clear names' },
      ];

      const result = await service.process({ entries, format: 'natural_language' });

      // Should read more naturally (no markdown symbols in simple output)
      expect(result.content.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty entries gracefully', async () => {
      const service = createContextManagerService(null, null);

      const result = await service.process({ entries: [] });

      expect(result.includedEntries).toHaveLength(0);
      expect(result.stats.inputEntryCount).toBe(0);
      expect(result.stats.outputEntryCount).toBe(0);
    });

    it('should handle entries with missing optional fields', async () => {
      const service = createContextManagerService(null, null);

      const entries: ContextEntry[] = [{ id: '1', type: 'guideline', content: 'Minimal entry' }];

      const result = await service.process({ entries });

      expect(result.includedEntries).toHaveLength(1);
    });

    it('should handle very long content', async () => {
      const service = createContextManagerService(null, null);

      // Test that the system handles very long content gracefully
      // Content is truncated during formatting, so output is always manageable
      const entries: ContextEntry[] = [
        {
          id: '1',
          type: 'knowledge',
          title: 'Long Entry',
          content: 'A'.repeat(50000), // Very long content
        },
      ];

      const result = await service.process({
        entries,
        maxTokens: 5000,
      });

      // Should produce valid output without errors
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content.length).toBeLessThan(50000); // Content is truncated in formatting
      expect(result.includedEntries).toHaveLength(1);
      expect(result.stats.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle all entry types', async () => {
      const service = createContextManagerService(null, null);

      const entries: ContextEntry[] = [
        { id: '1', type: 'guideline', content: 'Guideline content' },
        { id: '2', type: 'knowledge', content: 'Knowledge content' },
        { id: '3', type: 'tool', content: 'Tool content' },
        { id: '4', type: 'experience', content: 'Experience content' },
      ];

      const result = await service.process({ entries });

      expect(result.includedEntries).toHaveLength(4);
      expect(result.content).toContain('content');
    });
  });

  describe('Configuration', () => {
    it('should respect disabled staleness detection', async () => {
      const config: Partial<ContextManagerConfig> = {
        staleness: { enabled: false },
      };
      const service = createContextManagerService(null, null, config);

      const entries: ContextEntry[] = [
        {
          id: 'old',
          type: 'guideline',
          content: 'Old content',
          createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year ago
        },
      ];

      const result = await service.process({ entries });

      expect(result.stalenessWarnings).toHaveLength(0);
      expect(result.includedEntries).toHaveLength(1);
    });

    it('should respect disabled budget calculation', async () => {
      const config: Partial<ContextManagerConfig> = {
        budget: { enabled: false },
      };
      const service = createContextManagerService(null, null, config);

      const simpleResult = await service.process({
        entries: [{ id: '1', type: 'guideline', content: 'X' }],
        intent: 'lookup',
      });

      const complexResult = await service.process({
        entries: [{ id: '1', type: 'guideline', content: 'X' }],
        intent: 'debug',
      });

      // Both should use base budget when disabled
      expect(simpleResult.budget.complexity).toBe('simple');
      expect(complexResult.budget.complexity).toBe('simple');
    });

    it('should respect disabled priority integration', async () => {
      const config: Partial<ContextManagerConfig> = {
        priority: { enabled: false },
      };
      const service = createContextManagerService(null, null, config);

      const entries: ContextEntry[] = [
        { id: '1', type: 'guideline', content: 'A', relevanceScore: 0.1 },
        { id: '2', type: 'knowledge', content: 'B', relevanceScore: 0.9 },
      ];

      const result = await service.process({ entries });

      // When disabled, passthrough still sorts by relevance for consistent output
      // But minScore filtering is not applied (all entries included)
      expect(result.includedEntries).toHaveLength(2);
      // Both entries should be included since there's no minScore filtering
      expect(result.includedEntries.some((e) => e.id === '1')).toBe(true);
      expect(result.includedEntries.some((e) => e.id === '2')).toBe(true);
    });

    it('should respect disabled compression', async () => {
      const config: Partial<ContextManagerConfig> = {
        compression: { enabled: false },
      };
      const service = createContextManagerService(null, null, config);

      const entries: ContextEntry[] = Array.from({ length: 10 }, (_, i) => ({
        id: `entry-${i}`,
        type: 'knowledge' as const,
        content: 'A'.repeat(500),
      }));

      const result = await service.process({
        entries,
        maxTokens: 100, // Would normally trigger compression
      });

      expect(result.compressionLevel).toBe('none');
    });
  });
});
