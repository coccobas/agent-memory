/**
 * Unit tests for ContextInjectorService
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ContextInjectorService,
  type ContextInjectionOptions,
  type LatentMemoryWithScore,
} from '../../src/services/latent-memory/context-injector.js';

describe('ContextInjectorService', () => {
  let service: ContextInjectorService;

  const mockMemories: LatentMemoryWithScore[] = [
    {
      id: 'mem-1',
      sourceType: 'knowledge',
      sourceId: 'k1',
      textPreview: 'The system uses PostgreSQL for storage',
      similarityScore: 0.95,
    },
    {
      id: 'mem-2',
      sourceType: 'guideline',
      sourceId: 'g1',
      textPreview: 'Always use TypeScript strict mode',
      similarityScore: 0.88,
    },
    {
      id: 'mem-3',
      sourceType: 'tool',
      sourceId: 't1',
      textPreview: 'npm run test executes the test suite',
      similarityScore: 0.75,
    },
  ];

  beforeEach(() => {
    service = new ContextInjectorService();
  });

  describe('buildContext', () => {
    it('should build context with default options', () => {
      const options: ContextInjectionOptions = {
        format: 'markdown',
        maxTokens: 1000,
        maxMemories: 10,
      };

      const result = service.buildContext(mockMemories, options);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.tokensUsed).toBeGreaterThan(0);
      expect(result.memoriesUsed).toHaveLength(3);
    });

    it('should filter memories by minimum relevance', () => {
      const options: ContextInjectionOptions = {
        format: 'markdown',
        maxTokens: 1000,
        maxMemories: 10,
        minRelevance: 0.8,
      };

      const result = service.buildContext(mockMemories, options);

      expect(result.memoriesUsed).toHaveLength(2); // Only mem-1 and mem-2
      expect(result.memoriesUsed.every((m) => m.score >= 0.8)).toBe(true);
    });

    it('should limit number of memories', () => {
      const options: ContextInjectionOptions = {
        format: 'markdown',
        maxTokens: 10000,
        maxMemories: 2,
      };

      const result = service.buildContext(mockMemories, options);

      expect(result.memoriesUsed).toHaveLength(2);
    });

    it('should sort memories by similarity score', () => {
      const unsortedMemories = [mockMemories[2]!, mockMemories[0]!, mockMemories[1]!];
      const options: ContextInjectionOptions = {
        format: 'markdown',
        maxTokens: 1000,
        maxMemories: 10,
      };

      const result = service.buildContext(unsortedMemories, options);

      expect(result.memoriesUsed[0]?.score).toBe(0.95);
      expect(result.memoriesUsed[1]?.score).toBe(0.88);
      expect(result.memoriesUsed[2]?.score).toBe(0.75);
    });

    it('should respect token budget', () => {
      const longMemories: LatentMemoryWithScore[] = [
        {
          id: 'mem-1',
          sourceType: 'knowledge',
          sourceId: 'k1',
          textPreview: 'A'.repeat(1000),
          similarityScore: 0.95,
        },
        {
          id: 'mem-2',
          sourceType: 'knowledge',
          sourceId: 'k2',
          textPreview: 'B'.repeat(1000),
          similarityScore: 0.9,
        },
      ];

      const options: ContextInjectionOptions = {
        format: 'markdown',
        maxTokens: 100,
        maxMemories: 10,
      };

      const result = service.buildContext(longMemories, options);

      expect(result.memoriesUsed.length).toBeLessThanOrEqual(2);
    });

    it('should include at least one memory even if over budget', () => {
      const longMemory: LatentMemoryWithScore[] = [
        {
          id: 'mem-1',
          sourceType: 'knowledge',
          sourceId: 'k1',
          textPreview: 'A'.repeat(1000),
          similarityScore: 0.95,
        },
      ];

      const options: ContextInjectionOptions = {
        format: 'markdown',
        maxTokens: 10,
        maxMemories: 10,
      };

      const result = service.buildContext(longMemory, options);

      expect(result.memoriesUsed).toHaveLength(1);
    });

    it('should handle empty memories array', () => {
      const options: ContextInjectionOptions = {
        format: 'markdown',
        maxTokens: 1000,
        maxMemories: 10,
      };

      const result = service.buildContext([], options);

      expect(result.memoriesUsed).toHaveLength(0);
      expect(result.content).toBeDefined();
    });

    it('should include memory metadata in memoriesUsed', () => {
      const options: ContextInjectionOptions = {
        format: 'markdown',
        maxTokens: 1000,
        maxMemories: 10,
      };

      const result = service.buildContext(mockMemories, options);

      expect(result.memoriesUsed[0]).toEqual({
        id: 'mem-1',
        sourceType: 'knowledge',
        score: 0.95,
      });
    });
  });

  describe('formatAsJson', () => {
    it('should format memories as JSON without scores', () => {
      const result = service.formatAsJson(mockMemories, false);
      const parsed = JSON.parse(result);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(3);
      expect(parsed[0]).toEqual({
        type: 'knowledge',
        content: 'The system uses PostgreSQL for storage',
      });
      expect(parsed[0]).not.toHaveProperty('relevance');
    });

    it('should format memories as JSON with scores', () => {
      const result = service.formatAsJson(mockMemories, true);
      const parsed = JSON.parse(result);

      expect(parsed[0]).toEqual({
        type: 'knowledge',
        content: 'The system uses PostgreSQL for storage',
        relevance: 0.95,
      });
    });

    it('should round relevance scores to 2 decimal places', () => {
      const memoriesWithPreciseScores: LatentMemoryWithScore[] = [
        {
          id: 'mem-1',
          sourceType: 'knowledge',
          sourceId: 'k1',
          textPreview: 'Test',
          similarityScore: 0.123456789,
        },
      ];

      const result = service.formatAsJson(memoriesWithPreciseScores, true);
      const parsed = JSON.parse(result);

      expect(parsed[0]?.relevance).toBe(0.12);
    });

    it('should handle empty array', () => {
      const result = service.formatAsJson([], false);
      const parsed = JSON.parse(result);

      expect(parsed).toEqual([]);
    });
  });

  describe('formatAsMarkdown', () => {
    it('should format memories as markdown without scores', () => {
      const result = service.formatAsMarkdown(mockMemories, false, false);

      expect(result).toContain('## Relevant Context from Memory');
      expect(result).toContain('### Knowledge');
      expect(result).toContain('The system uses PostgreSQL for storage');
      expect(result).not.toContain('%');
    });

    it('should format memories as markdown with scores', () => {
      const result = service.formatAsMarkdown(mockMemories, true, false);

      expect(result).toContain('### Knowledge (95% relevant)');
      expect(result).toContain('### Guideline (88% relevant)');
      expect(result).toContain('### Tool (75% relevant)');
    });

    it('should group memories by type when requested', () => {
      const result = service.formatAsMarkdown(mockMemories, false, true);

      expect(result).toContain('### Knowledge');
      expect(result).toContain('### Guideline');
      expect(result).toContain('### Tool');
      expect(result).toContain('**Knowledge**');
    });

    it('should group memories with scores', () => {
      const result = service.formatAsMarkdown(mockMemories, true, true);

      expect(result).toContain('**Knowledge (95% relevant)**');
      expect(result).toContain('**Guideline (88% relevant)**');
    });

    it('should capitalize source types', () => {
      const result = service.formatAsMarkdown(mockMemories, false, false);

      expect(result).toContain('### Knowledge');
      expect(result).toContain('### Guideline');
      expect(result).toContain('### Tool');
      expect(result).not.toContain('### knowledge');
    });

    it('should handle empty array', () => {
      const result = service.formatAsMarkdown([], false, false);

      expect(result).toContain('## Relevant Context from Memory');
      expect(result.split('\n').length).toBeGreaterThan(0);
    });

    it('should format grouped memories correctly', () => {
      const multipleKnowledge: LatentMemoryWithScore[] = [
        {
          id: 'mem-1',
          sourceType: 'knowledge',
          sourceId: 'k1',
          textPreview: 'First knowledge',
          similarityScore: 0.95,
        },
        {
          id: 'mem-2',
          sourceType: 'knowledge',
          sourceId: 'k2',
          textPreview: 'Second knowledge',
          similarityScore: 0.9,
        },
      ];

      const result = service.formatAsMarkdown(multipleKnowledge, false, true);

      expect(result).toContain('### Knowledge');
      expect(result).toContain('First knowledge');
      expect(result).toContain('Second knowledge');
    });
  });

  describe('formatAsNaturalLanguage', () => {
    it('should format memories as natural language', () => {
      const result = service.formatAsNaturalLanguage(mockMemories);

      expect(result).toContain('Based on memory, the following context may be relevant:');
      expect(result).toContain('- The system uses PostgreSQL for storage');
      expect(result).toContain('- Always use TypeScript strict mode');
      expect(result).toContain('- npm run test executes the test suite');
    });

    it('should handle empty array', () => {
      const result = service.formatAsNaturalLanguage([]);

      expect(result).toBe('No relevant context found in memory.');
    });

    it('should format single memory', () => {
      const result = service.formatAsNaturalLanguage([mockMemories[0]!]);

      expect(result).toContain('Based on memory, the following context may be relevant:');
      expect(result).toContain('- The system uses PostgreSQL for storage');
    });

    it('should preserve memory order', () => {
      const result = service.formatAsNaturalLanguage(mockMemories);
      const lines = result.split('\n');

      expect(lines[2]).toContain('PostgreSQL');
      expect(lines[3]).toContain('TypeScript');
      expect(lines[4]).toContain('npm run test');
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens for simple text', () => {
      const text = 'This is a test';
      const tokens = service.estimateTokens(text);

      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBe(Math.ceil(4 * 1.3)); // 4 words * 1.3 = 6
    });

    it('should estimate tokens for empty string', () => {
      const tokens = service.estimateTokens('');

      expect(tokens).toBe(0);
    });

    it('should estimate tokens for long text', () => {
      const text = 'word '.repeat(100);
      const tokens = service.estimateTokens(text);

      expect(tokens).toBeGreaterThan(100);
    });

    it('should handle multiple whitespace', () => {
      const text = 'word1    word2     word3';
      const tokens = service.estimateTokens(text);

      expect(tokens).toBe(Math.ceil(3 * 1.3)); // 3 words * 1.3 = 4
    });

    it('should handle newlines', () => {
      const text = 'line1\nline2\nline3';
      const tokens = service.estimateTokens(text);

      expect(tokens).toBeGreaterThan(0);
    });

    it('should apply 1.3x multiplier for subword tokenization', () => {
      const text = 'one two three';
      const tokens = service.estimateTokens(text);

      expect(tokens).toBe(Math.ceil(3 * 1.3));
    });
  });

  describe('format selection', () => {
    it('should use JSON format when specified', () => {
      const options: ContextInjectionOptions = {
        format: 'json',
        maxTokens: 1000,
        maxMemories: 10,
      };

      const result = service.buildContext(mockMemories, options);

      expect(() => JSON.parse(result.content)).not.toThrow();
    });

    it('should use markdown format when specified', () => {
      const options: ContextInjectionOptions = {
        format: 'markdown',
        maxTokens: 1000,
        maxMemories: 10,
      };

      const result = service.buildContext(mockMemories, options);

      expect(result.content).toContain('##');
    });

    it('should use natural language format when specified', () => {
      const options: ContextInjectionOptions = {
        format: 'natural_language',
        maxTokens: 1000,
        maxMemories: 10,
      };

      const result = service.buildContext(mockMemories, options);

      expect(result.content).toContain('Based on memory');
    });
  });

  describe('token budget management', () => {
    it('should stop adding memories when token budget is reached', () => {
      const manyMemories: LatentMemoryWithScore[] = Array.from({ length: 100 }, (_, i) => ({
        id: `mem-${i}`,
        sourceType: 'knowledge',
        sourceId: `k${i}`,
        textPreview: 'This is a test memory with some content '.repeat(10),
        similarityScore: 1 - i * 0.01,
      }));

      const options: ContextInjectionOptions = {
        format: 'markdown',
        maxTokens: 500,
        maxMemories: 100,
      };

      const result = service.buildContext(manyMemories, options);

      expect(result.memoriesUsed.length).toBeLessThan(100);
      expect(result.tokensUsed).toBeLessThanOrEqual(options.maxTokens + 200); // Allow some overhead
    });

    it('should prioritize high-scoring memories within budget', () => {
      const manyMemories: LatentMemoryWithScore[] = Array.from({ length: 10 }, (_, i) => ({
        id: `mem-${i}`,
        sourceType: 'knowledge',
        sourceId: `k${i}`,
        textPreview: 'Test memory '.repeat(50),
        similarityScore: 1 - i * 0.1,
      }));

      const options: ContextInjectionOptions = {
        format: 'markdown',
        maxTokens: 200,
        maxMemories: 10,
      };

      const result = service.buildContext(manyMemories, options);

      // Should include highest scoring memories first
      // If only one memory fits, that's okay - just verify it's sorted
      if (result.memoriesUsed.length > 1) {
        expect(result.memoriesUsed[0]?.score).toBeGreaterThan(
          result.memoriesUsed[result.memoriesUsed.length - 1]?.score ?? 0
        );
      } else {
        expect(result.memoriesUsed[0]?.score).toBe(1.0);
      }
    });
  });

  describe('score formatting', () => {
    it('should format percentages correctly', () => {
      const memoriesWithVariousScores: LatentMemoryWithScore[] = [
        { id: '1', sourceType: 'knowledge', sourceId: 'k1', textPreview: 'Test', similarityScore: 0.001 },
        { id: '2', sourceType: 'knowledge', sourceId: 'k2', textPreview: 'Test', similarityScore: 0.5 },
        { id: '3', sourceType: 'knowledge', sourceId: 'k3', textPreview: 'Test', similarityScore: 0.999 },
        { id: '4', sourceType: 'knowledge', sourceId: 'k4', textPreview: 'Test', similarityScore: 1.0 },
      ];

      const result = service.formatAsMarkdown(memoriesWithVariousScores, true, false);

      expect(result).toContain('(0% relevant)');
      expect(result).toContain('(50% relevant)');
      expect(result).toContain('(100% relevant)');
    });
  });

  describe('edge cases', () => {
    it('should handle very long text previews', () => {
      const longMemory: LatentMemoryWithScore[] = [
        {
          id: 'mem-1',
          sourceType: 'knowledge',
          sourceId: 'k1',
          textPreview: 'A'.repeat(10000),
          similarityScore: 0.95,
        },
      ];

      const options: ContextInjectionOptions = {
        format: 'markdown',
        maxTokens: 100,
        maxMemories: 10,
      };

      const result = service.buildContext(longMemory, options);

      expect(result).toBeDefined();
    });

    it('should handle special characters in text', () => {
      const specialMemory: LatentMemoryWithScore[] = [
        {
          id: 'mem-1',
          sourceType: 'knowledge',
          sourceId: 'k1',
          textPreview: 'Test with "quotes" and <html> and & ampersand',
          similarityScore: 0.95,
        },
      ];

      const options: ContextInjectionOptions = {
        format: 'json',
        maxTokens: 1000,
        maxMemories: 10,
      };

      const result = service.buildContext(specialMemory, options);

      expect(() => JSON.parse(result.content)).not.toThrow();
    });

    it('should handle unicode characters', () => {
      const unicodeMemory: LatentMemoryWithScore[] = [
        {
          id: 'mem-1',
          sourceType: 'knowledge',
          sourceId: 'k1',
          textPreview: '测试 тест परीक्षण',
          similarityScore: 0.95,
        },
      ];

      const options: ContextInjectionOptions = {
        format: 'markdown',
        maxTokens: 1000,
        maxMemories: 10,
      };

      const result = service.buildContext(unicodeMemory, options);

      expect(result.content).toContain('测试');
    });

    it('should handle zero similarity scores', () => {
      const zeroScoreMemory: LatentMemoryWithScore[] = [
        {
          id: 'mem-1',
          sourceType: 'knowledge',
          sourceId: 'k1',
          textPreview: 'Test',
          similarityScore: 0,
        },
      ];

      const options: ContextInjectionOptions = {
        format: 'markdown',
        maxTokens: 1000,
        maxMemories: 10,
        includeScores: true,
      };

      const result = service.buildContext(zeroScoreMemory, options);

      expect(result.content).toContain('(0% relevant)');
    });
  });

  describe('grouping behavior', () => {
    it('should preserve order within groups', () => {
      const memories: LatentMemoryWithScore[] = [
        { id: '1', sourceType: 'knowledge', sourceId: 'k1', textPreview: 'First knowledge', similarityScore: 0.9 },
        { id: '2', sourceType: 'knowledge', sourceId: 'k2', textPreview: 'Second knowledge', similarityScore: 0.8 },
        { id: '3', sourceType: 'tool', sourceId: 't1', textPreview: 'First tool', similarityScore: 0.7 },
      ];

      const result = service.formatAsMarkdown(memories, false, true);

      const knowledgeIndex = result.indexOf('### Knowledge');
      const firstKnowledgeIndex = result.indexOf('First knowledge');
      const secondKnowledgeIndex = result.indexOf('Second knowledge');

      expect(knowledgeIndex).toBeLessThan(firstKnowledgeIndex);
      expect(firstKnowledgeIndex).toBeLessThan(secondKnowledgeIndex);
    });

    it('should handle mixed source types', () => {
      const mixedMemories: LatentMemoryWithScore[] = [
        { id: '1', sourceType: 'knowledge', sourceId: 'k1', textPreview: 'K1', similarityScore: 0.95 },
        { id: '2', sourceType: 'tool', sourceId: 't1', textPreview: 'T1', similarityScore: 0.9 },
        { id: '3', sourceType: 'knowledge', sourceId: 'k2', textPreview: 'K2', similarityScore: 0.85 },
        { id: '4', sourceType: 'guideline', sourceId: 'g1', textPreview: 'G1', similarityScore: 0.8 },
      ];

      const result = service.formatAsMarkdown(mixedMemories, false, true);

      expect(result).toContain('### Knowledge');
      expect(result).toContain('### Tool');
      expect(result).toContain('### Guideline');
    });
  });
});
