import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  QueryRewriteService,
  getQueryRewriteService,
  resetQueryRewriteService,
} from '../../src/services/query-rewrite/query-rewrite.service.js';
import type {
  RewriteInput,
  ClassificationResult,
  ExpandedQuery,
} from '../../src/services/query-rewrite/types.js';

describe('QueryRewriteService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton
    resetQueryRewriteService();
  });

  describe('Constructor and Configuration', () => {
    it('should use default expansion configuration', () => {
      const service = new QueryRewriteService();
      const config = service.getConfig();

      expect(config.enableExpansion).toBe(true);
      expect(config.enableHyDE).toBe(false);
      expect(config.expansion).toBeDefined();
      expect(config.expansion?.useDictionary).toBe(true);
      expect(config.expansion?.useRelations).toBe(false);
      expect(config.expansion?.useLLM).toBe(false);
      expect(config.expansion?.maxExpansions).toBe(5);
      expect(config.expansion?.expansionWeight).toBe(0.7);
    });

    it('should create classifier always', () => {
      const service = new QueryRewriteService();
      expect(service).toBeDefined();
      // Classifier is always created, check it's available
      expect((service as any).classifier).toBeDefined();
    });

    it('should create expander when expansion enabled', () => {
      const service = new QueryRewriteService({
        enableExpansion: true,
      });

      expect(service).toBeDefined();
      expect((service as any).expander).toBeDefined();
    });

    it('should not create expander when expansion disabled', () => {
      const service = new QueryRewriteService({
        enableExpansion: false,
      });

      expect(service).toBeDefined();
      expect((service as any).expander).toBeNull();
    });

    it('should merge custom expansion config with defaults', () => {
      const service = new QueryRewriteService({
        expansion: {
          useDictionary: false,
          useRelations: true,
          useLLM: false,
          maxExpansions: 10,
          expansionWeight: 0.8,
        },
      });

      const config = service.getConfig();
      expect(config.expansion?.useDictionary).toBe(false);
      expect(config.expansion?.useRelations).toBe(true);
      expect(config.expansion?.maxExpansions).toBe(10);
      expect(config.expansion?.expansionWeight).toBe(0.8);
    });

    it('should accept enableHyDE configuration', () => {
      const service = new QueryRewriteService({
        enableHyDE: true,
      });

      const config = service.getConfig();
      expect(config.enableHyDE).toBe(true);
    });

    it('should accept partial expansion config', () => {
      const service = new QueryRewriteService({
        expansion: {
          maxExpansions: 3,
        } as any,
      });

      const config = service.getConfig();
      expect(config.expansion?.maxExpansions).toBe(3);
      // Defaults should still be present
      expect(config.expansion?.useDictionary).toBe(true);
      expect(config.expansion?.expansionWeight).toBe(0.7);
    });
  });

  describe('rewrite method', () => {
    it('should always include original query with weight 1.0', async () => {
      const service = new QueryRewriteService({
        enableExpansion: false,
      });

      const input: RewriteInput = {
        originalQuery: 'test query',
      };

      const result = await service.rewrite(input);

      expect(result.rewrittenQueries).toHaveLength(1);
      expect(result.rewrittenQueries[0]).toEqual({
        text: 'test query',
        source: 'original',
        weight: 1.0,
      });
    });

    it('should classify intent from query', async () => {
      const service = new QueryRewriteService();

      const input: RewriteInput = {
        originalQuery: 'what is database',
      };

      const result = await service.rewrite(input);

      // Should have classified the query
      expect(result.intent).toBeDefined();
      expect(['lookup', 'how_to', 'debug', 'explore', 'compare', 'configure']).toContain(
        result.intent
      );
    });

    it('should use provided queryType if available', async () => {
      const service = new QueryRewriteService();

      const input: RewriteInput = {
        originalQuery: 'test query',
        queryType: 'how_to',
      };

      const result = await service.rewrite(input);

      expect(result.intent).toBe('how_to');
    });

    it('should apply expansion when enabled', async () => {
      const service = new QueryRewriteService({
        enableExpansion: true,
      });

      // Use a query that will get expanded (database -> db, etc.)
      const input: RewriteInput = {
        originalQuery: 'database config',
        options: {
          enableExpansion: true,
        },
      };

      const result = await service.rewrite(input);

      // Should have original + some expansions
      expect(result.rewrittenQueries.length).toBeGreaterThan(1);
      expect(result.rewrittenQueries[0]?.source).toBe('original');

      // Check that some expanded queries exist
      const hasExpansions = result.rewrittenQueries.some((q) => q.source === 'expansion');
      expect(hasExpansions).toBe(true);
    });

    it('should not apply expansion when disabled', async () => {
      const service = new QueryRewriteService({
        enableExpansion: true,
      });

      const input: RewriteInput = {
        originalQuery: 'test query',
        options: {
          enableExpansion: false,
        },
      };

      const result = await service.rewrite(input);

      expect(result.rewrittenQueries).toHaveLength(1); // Only original
    });

    it('should respect maxExpansions limit', async () => {
      const service = new QueryRewriteService({
        enableExpansion: true,
      });

      const input: RewriteInput = {
        originalQuery: 'database config',
        options: {
          enableExpansion: true,
          maxExpansions: 2,
        },
      };

      const result = await service.rewrite(input);

      // Should have original + at most 2 expansions
      const expansionCount = result.rewrittenQueries.filter((q) => q.source === 'expansion').length;
      expect(expansionCount).toBeLessThanOrEqual(2);
    });

    it('should use config maxExpansions if option not provided', async () => {
      const service = new QueryRewriteService({
        enableExpansion: true,
        expansion: {
          useDictionary: true,
          useRelations: false,
          useLLM: false,
          maxExpansions: 3,
          expansionWeight: 0.7,
        },
      });

      const input: RewriteInput = {
        originalQuery: 'database config',
        options: {
          enableExpansion: true,
        },
      };

      const result = await service.rewrite(input);

      // Should have original + at most 3 expansions
      const expansionCount = result.rewrittenQueries.filter((q) => q.source === 'expansion').length;
      expect(expansionCount).toBeLessThanOrEqual(3);
    });

    it('should determine correct strategy when nothing enabled', async () => {
      const service = new QueryRewriteService({
        enableExpansion: false,
        enableHyDE: false,
      });

      const result = await service.rewrite({
        originalQuery: 'test',
      });

      expect(result.strategy).toBe('direct');
    });

    it('should determine correct strategy when only expansion enabled', async () => {
      const service = new QueryRewriteService({
        enableExpansion: true,
        enableHyDE: false,
      });

      const result = await service.rewrite({
        originalQuery: 'test',
        options: { enableExpansion: true },
      });

      expect(result.strategy).toBe('expansion');
    });

    it('should determine correct strategy when only HyDE enabled', async () => {
      const service = new QueryRewriteService({
        enableExpansion: false,
        enableHyDE: true,
      });

      const result = await service.rewrite({
        originalQuery: 'test',
        options: { enableHyDE: true },
      });

      expect(result.strategy).toBe('hyde');
    });

    it('should determine correct strategy when both enabled', async () => {
      const service = new QueryRewriteService({
        enableExpansion: true,
        enableHyDE: true,
      });

      const result = await service.rewrite({
        originalQuery: 'test',
        options: { enableExpansion: true, enableHyDE: true },
      });

      expect(result.strategy).toBe('hybrid');
    });

    it('should sort queries by weight descending', async () => {
      const service = new QueryRewriteService({
        enableExpansion: true,
      });

      const result = await service.rewrite({
        originalQuery: 'database config',
        options: { enableExpansion: true },
      });

      // Original should be first (weight 1.0)
      expect(result.rewrittenQueries[0]?.source).toBe('original');
      expect(result.rewrittenQueries[0]?.weight).toBe(1.0);

      // Verify descending order
      for (let i = 1; i < result.rewrittenQueries.length; i++) {
        const prev = result.rewrittenQueries[i - 1];
        const curr = result.rewrittenQueries[i];
        expect(prev!.weight).toBeGreaterThanOrEqual(curr!.weight);
      }
    });

    it('should track processing time', async () => {
      const service = new QueryRewriteService();

      const result = await service.rewrite({
        originalQuery: 'test',
      });

      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.processingTimeMs).toBe('number');
    });

    it('should handle empty expansion results', async () => {
      const service = new QueryRewriteService({
        enableExpansion: true,
      });

      // Use a query that won't be expanded
      const result = await service.rewrite({
        originalQuery: 'xyz',
        options: { enableExpansion: true },
      });

      // Should have at least the original
      expect(result.rewrittenQueries.length).toBeGreaterThanOrEqual(1);
      expect(result.strategy).toBe('expansion');
    });

    it('should use default options when options not provided', async () => {
      const service = new QueryRewriteService({
        enableExpansion: true,
      });

      const result = await service.rewrite({
        originalQuery: 'test',
      });

      expect(result).toBeDefined();
      expect(result.rewrittenQueries).toBeDefined();
    });

    it('should handle options overriding config', async () => {
      const service = new QueryRewriteService({
        enableExpansion: true,
      });

      const result = await service.rewrite({
        originalQuery: 'test',
        options: {
          enableExpansion: false, // Override config
        },
      });

      expect(result.strategy).toBe('direct');
    });

    it('should apply expansion weight correctly', async () => {
      const service = new QueryRewriteService({
        enableExpansion: true,
        expansion: {
          useDictionary: true,
          useRelations: false,
          useLLM: false,
          maxExpansions: 5,
          expansionWeight: 0.5, // Custom weight
        },
      });

      const result = await service.rewrite({
        originalQuery: 'database',
        options: { enableExpansion: true },
      });

      // Find an expansion query
      const expandedQuery = result.rewrittenQueries.find((q) => q.source === 'expansion');
      if (expandedQuery) {
        // Weight should be less than or equal to 0.5 (expansionWeight)
        expect(expandedQuery.weight).toBeLessThanOrEqual(0.5);
      }
    });

    it('should include intent in result', async () => {
      const service = new QueryRewriteService();

      const result = await service.rewrite({
        originalQuery: 'error in database',
      });

      expect(result.intent).toBeDefined();
      expect(['lookup', 'how_to', 'debug', 'explore', 'compare', 'configure']).toContain(
        result.intent
      );
    });
  });

  describe('classifyIntent', () => {
    it('should delegate to classifier', async () => {
      const service = new QueryRewriteService();

      const result = await service.classifyIntent('test query');

      expect(result).toBeDefined();
      expect(result.intent).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should return intent and confidence', async () => {
      const service = new QueryRewriteService();

      const result = await service.classifyIntent('how to setup database');

      expect(result.intent).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.method).toBeDefined();
    });

    it('should handle different query types', async () => {
      const service = new QueryRewriteService();

      const queries = ['what is this', 'how to configure', 'error in code', 'compare options'];

      for (const query of queries) {
        const result = await service.classifyIntent(query);
        expect(result.intent).toBeDefined();
        expect(result.confidence).toBeGreaterThan(0);
      }
    });
  });

  describe('isAvailable', () => {
    it('should return true when expansion enabled', () => {
      const service = new QueryRewriteService({
        enableExpansion: true,
        enableHyDE: false,
      });

      expect(service.isAvailable()).toBe(true);
    });

    it('should return true when HyDE enabled', () => {
      const service = new QueryRewriteService({
        enableExpansion: false,
        enableHyDE: true,
      });

      expect(service.isAvailable()).toBe(true);
    });

    it('should return true when both enabled', () => {
      const service = new QueryRewriteService({
        enableExpansion: true,
        enableHyDE: true,
      });

      expect(service.isAvailable()).toBe(true);
    });

    it('should return false when nothing enabled', () => {
      const service = new QueryRewriteService({
        enableExpansion: false,
        enableHyDE: false,
      });

      expect(service.isAvailable()).toBe(false);
    });

    it('should return true when expander exists', () => {
      const service = new QueryRewriteService({
        enableExpansion: true,
      });

      expect(service.isAvailable()).toBe(true);
    });
  });

  describe('updateConfig', () => {
    it('should merge expansion config', () => {
      const service = new QueryRewriteService({
        expansion: {
          useDictionary: true,
          useRelations: false,
          useLLM: false,
          maxExpansions: 5,
          expansionWeight: 0.7,
        },
      });

      service.updateConfig({
        expansion: {
          maxExpansions: 10,
        } as any,
      });

      const config = service.getConfig();
      expect(config.expansion?.maxExpansions).toBe(10);
      // Other values should be preserved
      expect(config.expansion?.useDictionary).toBe(true);
      expect(config.expansion?.expansionWeight).toBe(0.7);
    });

    it('should recreate expander when expansion config changes', () => {
      const service = new QueryRewriteService({
        enableExpansion: true,
      });

      const expanderBefore = (service as any).expander;

      service.updateConfig({
        expansion: {
          maxExpansions: 10,
        } as any,
      });

      const expanderAfter = (service as any).expander;

      // Should be a different instance
      expect(expanderAfter).not.toBe(expanderBefore);
      expect(expanderAfter).toBeDefined();
    });

    it('should recreate expander when enableExpansion changes', () => {
      const service = new QueryRewriteService({
        enableExpansion: false,
      });

      expect((service as any).expander).toBeNull();

      service.updateConfig({
        enableExpansion: true,
      });

      expect((service as any).expander).toBeDefined();
    });

    it('should set expander to null when expansion disabled', () => {
      const service = new QueryRewriteService({
        enableExpansion: true,
      });

      service.updateConfig({
        enableExpansion: false,
      });

      expect((service as any).expander).toBeNull();
    });

    it('should handle partial updates', () => {
      const service = new QueryRewriteService({
        enableExpansion: true,
        enableHyDE: false,
      });

      service.updateConfig({
        enableHyDE: true,
      });

      const config = service.getConfig();
      expect(config.enableExpansion).toBe(true);
      expect(config.enableHyDE).toBe(true);
    });

    it('should preserve defaults when merging', () => {
      const service = new QueryRewriteService();

      service.updateConfig({
        enableHyDE: true,
      });

      const config = service.getConfig();
      expect(config.expansion?.useDictionary).toBe(true);
      expect(config.expansion?.maxExpansions).toBe(5);
    });

    it('should update multiple config values', () => {
      const service = new QueryRewriteService();

      service.updateConfig({
        enableExpansion: false,
        enableHyDE: true,
        expansion: {
          maxExpansions: 3,
        } as any,
      });

      const config = service.getConfig();
      expect(config.enableExpansion).toBe(false);
      expect(config.enableHyDE).toBe(true);
      expect(config.expansion?.maxExpansions).toBe(3);
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const service = new QueryRewriteService({
        enableExpansion: true,
        enableHyDE: false,
        expansion: {
          useDictionary: true,
          useRelations: false,
          useLLM: false,
          maxExpansions: 5,
          expansionWeight: 0.7,
        },
      });

      const config = service.getConfig();

      expect(config.enableExpansion).toBe(true);
      expect(config.enableHyDE).toBe(false);
      expect(config.expansion?.useDictionary).toBe(true);
    });

    it('should return a copy not a reference', () => {
      const service = new QueryRewriteService();

      const config1 = service.getConfig();
      const config2 = service.getConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });

    it('should reflect updates after updateConfig', () => {
      const service = new QueryRewriteService();

      service.updateConfig({
        enableHyDE: true,
      });

      const config = service.getConfig();
      expect(config.enableHyDE).toBe(true);
    });
  });

  describe('Strategy determination', () => {
    it('should return direct when nothing enabled', async () => {
      const service = new QueryRewriteService({
        enableExpansion: false,
        enableHyDE: false,
      });

      const result = await service.rewrite({
        originalQuery: 'test',
        options: {
          enableExpansion: false,
          enableHyDE: false,
        },
      });

      expect(result.strategy).toBe('direct');
    });

    it('should return expansion when only expansion enabled', async () => {
      const service = new QueryRewriteService({
        enableExpansion: true,
        enableHyDE: false,
      });

      const result = await service.rewrite({
        originalQuery: 'test',
        options: {
          enableExpansion: true,
          enableHyDE: false,
        },
      });

      expect(result.strategy).toBe('expansion');
    });

    it('should return hyde when only HyDE enabled', async () => {
      const service = new QueryRewriteService({
        enableExpansion: false,
        enableHyDE: true,
      });

      const result = await service.rewrite({
        originalQuery: 'test',
        options: {
          enableExpansion: false,
          enableHyDE: true,
        },
      });

      expect(result.strategy).toBe('hyde');
    });

    it('should return hybrid when both enabled', async () => {
      const service = new QueryRewriteService({
        enableExpansion: true,
        enableHyDE: true,
      });

      const result = await service.rewrite({
        originalQuery: 'test',
        options: {
          enableExpansion: true,
          enableHyDE: true,
        },
      });

      expect(result.strategy).toBe('hybrid');
    });
  });

  describe('Singleton functions', () => {
    beforeEach(() => {
      resetQueryRewriteService();
    });

    it('should return same instance on multiple calls', () => {
      const service1 = getQueryRewriteService();
      const service2 = getQueryRewriteService();

      expect(service1).toBe(service2);
    });

    it('should create instance with defaults', () => {
      const service = getQueryRewriteService();
      const config = service.getConfig();

      expect(config.enableExpansion).toBe(true);
      expect(config.enableHyDE).toBe(false);
    });

    it('should reset singleton instance', () => {
      const service1 = getQueryRewriteService();
      resetQueryRewriteService();
      const service2 = getQueryRewriteService();

      expect(service1).not.toBe(service2);
    });

    it('should create new instance after reset', () => {
      const service1 = getQueryRewriteService();
      service1.updateConfig({ enableHyDE: true });

      resetQueryRewriteService();

      const service2 = getQueryRewriteService();
      const config = service2.getConfig();

      // Should be fresh instance with defaults
      expect(config.enableHyDE).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty query string', async () => {
      const service = new QueryRewriteService();

      const result = await service.rewrite({
        originalQuery: '',
      });

      expect(result.rewrittenQueries).toHaveLength(1);
      expect(result.rewrittenQueries[0]?.text).toBe('');
    });

    it('should handle very long query strings', async () => {
      const service = new QueryRewriteService();

      const longQuery = 'a'.repeat(10000);

      const result = await service.rewrite({
        originalQuery: longQuery,
      });

      expect(result.rewrittenQueries[0]?.text).toBe(longQuery);
    });

    it('should handle query with special characters', async () => {
      const service = new QueryRewriteService();

      const specialQuery = 'test@#$%^&*(){}[]|\\;:"<>?/';

      const result = await service.rewrite({
        originalQuery: specialQuery,
      });

      expect(result.rewrittenQueries[0]?.text).toBe(specialQuery);
    });

    it('should handle maxExpansions of 0', async () => {
      const service = new QueryRewriteService({
        enableExpansion: true,
      });

      const result = await service.rewrite({
        originalQuery: 'database',
        options: {
          enableExpansion: true,
          maxExpansions: 0,
        },
      });

      // Should only have original query
      expect(result.rewrittenQueries).toHaveLength(1);
      expect(result.rewrittenQueries[0]?.source).toBe('original');
    });

    it('should handle undefined config values gracefully', () => {
      const service = new QueryRewriteService(undefined);

      const config = service.getConfig();
      expect(config.enableExpansion).toBe(true);
      expect(config.enableHyDE).toBe(false);
    });
  });

  describe('Context hints', () => {
    it('should accept context hints in input', async () => {
      const service = new QueryRewriteService();

      const input: RewriteInput = {
        originalQuery: 'test',
        contextHints: {
          projectName: 'my-project',
          recentTopics: ['database', 'auth'],
          conversationDepth: 3,
        },
      };

      const result = await service.rewrite(input);
      expect(result).toBeDefined();
    });

    it('should handle partial context hints', async () => {
      const service = new QueryRewriteService();

      const input: RewriteInput = {
        originalQuery: 'test',
        contextHints: {
          projectName: 'my-project',
        },
      };

      const result = await service.rewrite(input);
      expect(result).toBeDefined();
    });

    it('should handle missing context hints', async () => {
      const service = new QueryRewriteService();

      const input: RewriteInput = {
        originalQuery: 'test',
      };

      const result = await service.rewrite(input);
      expect(result).toBeDefined();
    });
  });
});
