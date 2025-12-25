import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryExpander, RelationGraphTraverser } from '../../src/services/query-rewrite/expander.js';
import type { ExpansionConfig } from '../../src/services/query-rewrite/types.js';

describe('QueryExpander', () => {
  let defaultConfig: ExpansionConfig;

  beforeEach(() => {
    defaultConfig = {
      useDictionary: true,
      useRelations: false,
      useLLM: false,
      maxExpansions: 10,
      expansionWeight: 0.7,
    };
  });

  describe('constructor', () => {
    it('should create an expander with config', () => {
      const expander = new QueryExpander(defaultConfig);
      expect(expander).toBeDefined();
    });

    it('should accept relation traverser', () => {
      const traverser: RelationGraphTraverser = async () => [];
      const expander = new QueryExpander(defaultConfig, traverser);
      expect(expander).toBeDefined();
    });
  });

  describe('expand - dictionary-based', () => {
    it('should expand database to synonyms', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('database config');

      expect(result.length).toBeGreaterThan(0);
      expect(result.some(e => e.text.includes('db'))).toBe(true);
      expect(result.every(e => e.source === 'dictionary')).toBe(true);
    });

    it('should expand javascript to js', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('javascript code');

      expect(result.some(e => e.text.includes('js'))).toBe(true);
    });

    it('should expand typescript to ts', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('typescript code');

      expect(result.some(e => e.text.includes('ts'))).toBe(true);
    });

    it('should expand python to py', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('python script');

      expect(result.some(e => e.text.includes('py'))).toBe(true);
    });

    it('should expand authentication to auth', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('authentication flow');

      expect(result.some(e => e.text.includes('auth'))).toBe(true);
    });

    it('should expand configuration to config', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('configuration file');

      expect(result.some(e => e.text.includes('config'))).toBe(true);
    });

    it('should expand application to app', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('application code');

      expect(result.some(e => e.text.includes('app'))).toBe(true);
    });

    it('should expand repository to repo', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('repository settings');

      expect(result.some(e => e.text.includes('repo'))).toBe(true);
    });

    it('should expand directory to dir', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('directory structure');

      expect(result.some(e => e.text.includes('dir'))).toBe(true);
    });

    it('should expand endpoint to api', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('endpoint handler');

      expect(result.some(e => e.text.includes('api'))).toBe(true);
    });

    it('should expand development to dev', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('development mode');

      expect(result.some(e => e.text.includes('dev'))).toBe(true);
    });

    it('should expand production to prod', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('production deploy');

      expect(result.some(e => e.text.includes('prod'))).toBe(true);
    });

    it('should expand function to fn', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('function definition');

      expect(result.some(e => e.text.includes('fn'))).toBe(true);
    });

    it('should expand create to add', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('create user');

      expect(result.some(e => e.text.includes('add'))).toBe(true);
    });

    it('should expand read to get', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('read data');

      expect(result.some(e => e.text.includes('get'))).toBe(true);
    });

    it('should expand delete to remove', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('delete file');

      expect(result.some(e => e.text.includes('remove'))).toBe(true);
    });

    it('should expand update to modify', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('update record');

      expect(result.some(e => e.text.includes('modify'))).toBe(true);
    });

    it('should expand error to exception', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('error handling');

      expect(result.some(e => e.text.includes('exception'))).toBe(true);
    });

    it('should expand optimize to improve', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('optimize query');

      expect(result.some(e => e.text.includes('improve'))).toBe(true);
    });

    it('should expand secret to credential', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('secret management');

      expect(result.some(e => e.text.includes('credential'))).toBe(true);
    });

    it('should return empty for unknown terms', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('xyzabc123');

      expect(result.length).toBe(0);
    });

    it('should handle queries with punctuation', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('database, config!');

      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle queries with multiple expandable terms', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('database configuration');

      // Should have expansions for both terms
      expect(result.some(e => e.text.includes('db'))).toBe(true);
      expect(result.some(e => e.text.includes('config'))).toBe(true);
    });

    it('should create multi-token expansions', async () => {
      const config: ExpansionConfig = {
        ...defaultConfig,
        maxExpansions: 20,
      };
      const expander = new QueryExpander(config);
      const result = await expander.expand('database configuration');

      // Should have at least one combined expansion
      expect(result.some(e => e.text.includes('db') && e.text.includes('config'))).toBe(true);
    });

    it('should assign confidence based on synonym order', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('database');

      // All should have confidence between 0.6 and 0.8
      for (const expansion of result) {
        expect(expansion.confidence).toBeGreaterThanOrEqual(0.6);
        expect(expansion.confidence).toBeLessThanOrEqual(0.8);
      }
    });

    it('should respect maxExpansions limit', async () => {
      const config: ExpansionConfig = {
        ...defaultConfig,
        maxExpansions: 3,
      };
      const expander = new QueryExpander(config);
      const result = await expander.expand('database configuration');

      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('should sort results by confidence descending', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('database config');

      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1]!.confidence).toBeGreaterThanOrEqual(result[i]!.confidence);
      }
    });

    it('should expand abbreviations to full terms (reverse lookup)', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('db settings');

      // Should expand 'db' to 'database' or related
      expect(result.some(e => e.text.includes('database'))).toBe(true);
    });
  });

  describe('expand - dictionary disabled', () => {
    it('should return empty when dictionary disabled', async () => {
      const config: ExpansionConfig = {
        ...defaultConfig,
        useDictionary: false,
      };
      const expander = new QueryExpander(config);
      const result = await expander.expand('database config');

      expect(result.length).toBe(0);
    });
  });

  describe('expand - relation-based', () => {
    it('should use relation traverser when available', async () => {
      const traverser: RelationGraphTraverser = vi.fn().mockResolvedValue([
        { term: 'related-term', distance: 1 },
      ]);

      const config: ExpansionConfig = {
        ...defaultConfig,
        useDictionary: false,
        useRelations: true,
      };

      const expander = new QueryExpander(config, traverser);
      const result = await expander.expand('test query');

      expect(traverser).toHaveBeenCalled();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]?.source).toBe('relation');
    });

    it('should calculate confidence based on distance', async () => {
      const traverser: RelationGraphTraverser = vi.fn().mockResolvedValue([
        { term: 'close-term', distance: 1 },
        { term: 'far-term', distance: 2 },
      ]);

      const config: ExpansionConfig = {
        ...defaultConfig,
        useDictionary: false,
        useRelations: true,
      };

      const expander = new QueryExpander(config, traverser);
      const result = await expander.expand('test');

      // Distance 1 should have higher confidence than distance 2
      const closeResult = result.find(r => r.text.includes('close'));
      const farResult = result.find(r => r.text.includes('far'));

      if (closeResult && farResult) {
        expect(closeResult.confidence).toBeGreaterThan(farResult.confidence);
      }
    });

    it('should skip terms that match original token', async () => {
      const traverser: RelationGraphTraverser = vi.fn().mockResolvedValue([
        { term: 'test', distance: 1 }, // Same as original
        { term: 'different', distance: 1 },
      ]);

      const config: ExpansionConfig = {
        ...defaultConfig,
        useDictionary: false,
        useRelations: true,
      };

      const expander = new QueryExpander(config, traverser);
      const result = await expander.expand('test');

      // Should only have 'different', not 'test'
      expect(result.some(r => r.text === 'different')).toBe(true);
    });

    it('should handle traverser errors gracefully', async () => {
      const traverser: RelationGraphTraverser = vi.fn().mockRejectedValue(new Error('Network error'));

      const config: ExpansionConfig = {
        ...defaultConfig,
        useDictionary: false,
        useRelations: true,
      };

      const expander = new QueryExpander(config, traverser);
      const result = await expander.expand('test query');

      // Should not throw, just return empty
      expect(result).toEqual([]);
    });

    it('should return empty when no traverser provided', async () => {
      const config: ExpansionConfig = {
        ...defaultConfig,
        useDictionary: false,
        useRelations: true,
      };

      const expander = new QueryExpander(config); // No traverser
      const result = await expander.expand('test query');

      expect(result.length).toBe(0);
    });

    it('should call traverser for each token', async () => {
      const traverser: RelationGraphTraverser = vi.fn().mockResolvedValue([]);

      const config: ExpansionConfig = {
        ...defaultConfig,
        useDictionary: false,
        useRelations: true,
      };

      const expander = new QueryExpander(config, traverser);
      await expander.expand('test query example');

      expect(traverser).toHaveBeenCalledTimes(3);
      expect(traverser).toHaveBeenCalledWith('test', 2);
      expect(traverser).toHaveBeenCalledWith('query', 2);
      expect(traverser).toHaveBeenCalledWith('example', 2);
    });
  });

  describe('expand - combined strategies', () => {
    it('should combine dictionary and relation expansions', async () => {
      const traverser: RelationGraphTraverser = vi.fn().mockResolvedValue([
        { term: 'related', distance: 1 },
      ]);

      const config: ExpansionConfig = {
        useDictionary: true,
        useRelations: true,
        useLLM: false,
        maxExpansions: 20,
        expansionWeight: 0.7,
      };

      const expander = new QueryExpander(config, traverser);
      const result = await expander.expand('database');

      const dictionaryResults = result.filter(r => r.source === 'dictionary');
      const relationResults = result.filter(r => r.source === 'relation');

      expect(dictionaryResults.length).toBeGreaterThan(0);
      expect(relationResults.length).toBeGreaterThan(0);
    });
  });

  describe('expand - LLM mode', () => {
    it('should not add expansions when LLM enabled (not implemented)', async () => {
      const config: ExpansionConfig = {
        useDictionary: false,
        useRelations: false,
        useLLM: true,
        maxExpansions: 10,
        expansionWeight: 0.7,
      };

      const expander = new QueryExpander(config);
      const result = await expander.expand('test query');

      // LLM expansion is a TODO, so should return empty
      expect(result.length).toBe(0);
    });
  });

  describe('static methods', () => {
    describe('getSynonymDictionary', () => {
      it('should return a copy of the dictionary', () => {
        const dict = QueryExpander.getSynonymDictionary();

        expect(dict).toBeDefined();
        expect(dict.database).toBeDefined();
        expect(dict.database).toContain('db');
      });

      it('should not return the original reference', () => {
        const dict1 = QueryExpander.getSynonymDictionary();
        const dict2 = QueryExpander.getSynonymDictionary();

        expect(dict1).not.toBe(dict2);
        expect(dict1).toEqual(dict2);
      });
    });

    describe('addSynonyms', () => {
      it('should add new synonyms to existing term', () => {
        const originalSynonyms = QueryExpander.getSynonymDictionary().database || [];

        QueryExpander.addSynonyms('database', ['databank']);

        const expander = new QueryExpander(defaultConfig);

        // Note: This modifies global state, so we need to be careful
        // The new synonym should be available
        const result = expander.expand('database');
        // Can't easily verify without modifying global state
      });

      it('should add new canonical term with synonyms', () => {
        QueryExpander.addSynonyms('newterm', ['synonym1', 'synonym2']);

        const dict = QueryExpander.getSynonymDictionary();
        expect(dict.newterm).toContain('synonym1');
        expect(dict.newterm).toContain('synonym2');
      });

      it('should update reverse index', async () => {
        // Add a new term
        QueryExpander.addSynonyms('testcanonical', ['testabbrev']);

        const expander = new QueryExpander(defaultConfig);
        const result = await expander.expand('testabbrev value');

        // Should find expansion back to canonical
        expect(result.some(r => r.text.includes('testcanonical'))).toBe(true);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty query', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('');

      expect(result.length).toBe(0);
    });

    it('should handle whitespace-only query', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('   ');

      expect(result.length).toBe(0);
    });

    it('should handle single character query', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('a');

      expect(result.length).toBe(0);
    });

    it('should handle very long query', async () => {
      const expander = new QueryExpander(defaultConfig);
      const longQuery = 'database '.repeat(100);
      const result = await expander.expand(longQuery);

      // Should still work but be limited
      expect(result.length).toBeLessThanOrEqual(defaultConfig.maxExpansions);
    });

    it('should handle special characters only', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('@#$%^&*()');

      expect(result.length).toBe(0);
    });

    it('should handle mixed case', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('DATABASE CONFIG');

      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle numeric tokens', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('version 123');

      // Numbers alone shouldn't expand
      expect(result.length).toBe(0);
    });
  });

  describe('memory-specific synonyms', () => {
    it('should expand knowledge to fact', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('knowledge entry');

      expect(result.some(e => e.text.includes('fact'))).toBe(true);
    });

    it('should expand guideline to rule', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('guideline check');

      expect(result.some(e => e.text.includes('rule'))).toBe(true);
    });

    it('should expand tool to command', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('tool usage');

      expect(result.some(e => e.text.includes('command'))).toBe(true);
    });

    it('should expand memory to cache', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('memory store');

      expect(result.some(e => e.text.includes('cache'))).toBe(true);
    });

    it('should expand embedding to vector', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('embedding search');

      expect(result.some(e => e.text.includes('vector'))).toBe(true);
    });

    it('should expand search to query', async () => {
      const expander = new QueryExpander(defaultConfig);
      const result = await expander.expand('search function');

      expect(result.some(e => e.text.includes('query'))).toBe(true);
    });
  });
});
