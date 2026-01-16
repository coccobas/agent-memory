/**
 * Tests for the LLM-Based Cross-Encoder Re-ranking Stage
 *
 * Tests cross-encoder scoring using LLM to jointly score query-document pairs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createCrossEncoderStage,
  buildScoringPrompt,
  buildEntityAwareScoringPrompt,
  parseScoresResponse,
  createOpenAICrossEncoderService,
  DEFAULT_CROSS_ENCODER_CONFIG,
  type CrossEncoderDependencies,
  type CrossEncoderLLMService,
  type CrossEncoderPipelineContext,
} from '../../src/services/query/stages/cross-encoder-rerank.js';
import type { PipelineContext, QueryResultItem } from '../../src/services/query/pipeline.js';

describe('Cross-Encoder Re-ranking Stage', () => {
  // Helper to create mock query result items
  function createMockResults(count: number): QueryResultItem[] {
    const results: QueryResultItem[] = [];
    for (let i = 0; i < count; i++) {
      if (i % 4 === 0) {
        results.push({
          type: 'tool',
          id: `tool-${i}`,
          score: 1 - i * 0.05,
          tool: { id: `tool-${i}`, name: `Tool ${i}`, category: 'cli' },
        } as QueryResultItem);
      } else if (i % 4 === 1) {
        results.push({
          type: 'guideline',
          id: `guideline-${i}`,
          score: 1 - i * 0.05,
          guideline: { id: `guideline-${i}`, name: `Guideline ${i}`, category: 'code_style' },
        } as QueryResultItem);
      } else if (i % 4 === 2) {
        results.push({
          type: 'knowledge',
          id: `knowledge-${i}`,
          score: 1 - i * 0.05,
          knowledge: { id: `knowledge-${i}`, title: `Knowledge ${i}`, category: 'fact' },
        } as QueryResultItem);
      } else {
        results.push({
          type: 'experience',
          id: `experience-${i}`,
          score: 1 - i * 0.05,
          experience: { id: `experience-${i}`, title: `Experience ${i}`, category: 'debugging' },
        } as QueryResultItem);
      }
    }
    return results;
  }

  // Helper to create minimal pipeline context
  function createMockContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
    return {
      search: 'test query',
      params: {
        semanticSearch: true,
        limit: 20,
      },
      results: createMockResults(10),
      fetchedEntries: {
        tools: [],
        guidelines: [],
        knowledge: [],
        experiences: [],
      },
      deps: {
        perfLog: false,
        logger: {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
      },
      ...overrides,
    } as unknown as PipelineContext;
  }

  // Helper to create mock LLM service
  function createMockLLMService(
    overrides: Partial<CrossEncoderLLMService> = {}
  ): CrossEncoderLLMService {
    return {
      scoreRelevance: vi.fn().mockImplementation(async (_query, documents) => {
        return documents.map((d: { id: string }, i: number) => ({
          id: d.id,
          score: 0.9 - i * 0.1,
        }));
      }),
      isAvailable: vi.fn().mockReturnValue(true),
      ...overrides,
    };
  }

  // Helper to create mock dependencies
  function createMockDeps(
    overrides: Partial<CrossEncoderDependencies> = {}
  ): CrossEncoderDependencies {
    return {
      llmService: createMockLLMService(),
      config: {
        enabled: true,
      },
      ...overrides,
    };
  }

  describe('DEFAULT_CROSS_ENCODER_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_CROSS_ENCODER_CONFIG.enabled).toBe(false);
      expect(DEFAULT_CROSS_ENCODER_CONFIG.topK).toBe(15);
      expect(DEFAULT_CROSS_ENCODER_CONFIG.alpha).toBe(0.6);
      expect(DEFAULT_CROSS_ENCODER_CONFIG.temperature).toBe(0.1);
      expect(DEFAULT_CROSS_ENCODER_CONFIG.timeoutMs).toBe(30000);
      expect(DEFAULT_CROSS_ENCODER_CONFIG.concurrency).toBe(5);
    });
  });

  describe('createCrossEncoderStage', () => {
    it('should create a stage function', () => {
      const deps = createMockDeps();
      const stage = createCrossEncoderStage(deps);

      expect(typeof stage).toBe('function');
    });

    it('should skip when disabled', async () => {
      const llmService = createMockLLMService();
      const deps = createMockDeps({
        llmService,
        config: { enabled: false },
      });
      const stage = createCrossEncoderStage(deps);
      const ctx = createMockContext();

      const result = await stage(ctx);

      expect(llmService.scoreRelevance).not.toHaveBeenCalled();
      expect(result).toBe(ctx);
    });

    it('should skip when no results', async () => {
      const llmService = createMockLLMService();
      const deps = createMockDeps({ llmService });
      const stage = createCrossEncoderStage(deps);
      const ctx = createMockContext({ results: [] });

      const result = await stage(ctx);

      expect(llmService.scoreRelevance).not.toHaveBeenCalled();
    });

    it('should skip when no search query', async () => {
      const llmService = createMockLLMService();
      const deps = createMockDeps({ llmService });
      const stage = createCrossEncoderStage(deps);
      const ctx = createMockContext({ search: '' });

      const result = await stage(ctx);

      expect(llmService.scoreRelevance).not.toHaveBeenCalled();
    });

    it('should skip when LLM service not available', async () => {
      const llmService = createMockLLMService({
        isAvailable: vi.fn().mockReturnValue(false),
      });
      const deps = createMockDeps({ llmService });
      const stage = createCrossEncoderStage(deps);
      const ctx = createMockContext();

      const result = await stage(ctx);

      expect(llmService.isAvailable).toHaveBeenCalled();
      expect(llmService.scoreRelevance).not.toHaveBeenCalled();
    });

    it('should perform cross-encoder scoring when conditions are met', async () => {
      const llmService = createMockLLMService();
      const deps = createMockDeps({ llmService });
      const stage = createCrossEncoderStage(deps);
      const ctx = createMockContext();

      const result = (await stage(ctx)) as CrossEncoderPipelineContext;

      expect(llmService.scoreRelevance).toHaveBeenCalledWith(
        'test query',
        expect.arrayContaining([
          expect.objectContaining({ id: expect.any(String), text: expect.any(String) }),
        ])
      );
      expect(result.crossEncoder).toBeDefined();
      expect(result.crossEncoder?.applied).toBe(true);
    });

    it('should limit scoring to topK candidates', async () => {
      const llmService = createMockLLMService();
      const deps = createMockDeps({
        llmService,
        config: { enabled: true, topK: 5 },
      });
      const stage = createCrossEncoderStage(deps);
      const ctx = createMockContext({ results: createMockResults(20) });

      const result = (await stage(ctx)) as CrossEncoderPipelineContext;

      // Should only process top 5 candidates
      expect(result.crossEncoder?.candidatesScored).toBe(5);
      const callArgs = (llmService.scoreRelevance as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].length).toBe(5);
    });

    it('should track processing time', async () => {
      const deps = createMockDeps();
      const stage = createCrossEncoderStage(deps);
      const ctx = createMockContext();

      const result = (await stage(ctx)) as CrossEncoderPipelineContext;

      expect(result.crossEncoder?.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should blend scores using alpha', async () => {
      const llmService = createMockLLMService({
        scoreRelevance: vi.fn().mockResolvedValue([{ id: 'tool-0', score: 1.0 }]),
      });
      const deps = createMockDeps({
        llmService,
        config: { enabled: true, topK: 1, alpha: 0.6 },
      });
      const stage = createCrossEncoderStage(deps);

      const ctx = createMockContext({
        results: [
          {
            type: 'tool',
            id: 'tool-0',
            score: 0.5, // Original score
            tool: { id: 'tool-0', name: 'Tool', category: 'cli' },
          } as QueryResultItem,
        ],
      });

      const result = (await stage(ctx)) as CrossEncoderPipelineContext;

      // Cross score = 1.0, original = 0.5
      // Blended = 0.6 * 1.0 + 0.4 * 0.5 = 0.8
      expect(result.results[0].score).toBeCloseTo(0.8, 5);
    });

    it('should re-sort results after scoring', async () => {
      const llmService = createMockLLMService({
        scoreRelevance: vi.fn().mockResolvedValue([
          { id: 'tool-0', score: 0.3 }, // Low cross score
          { id: 'guideline-1', score: 0.9 }, // High cross score
        ]),
      });
      const deps = createMockDeps({
        llmService,
        config: { enabled: true, topK: 2, alpha: 0.8 },
      });
      const stage = createCrossEncoderStage(deps);

      const ctx = createMockContext({
        results: [
          {
            type: 'tool',
            id: 'tool-0',
            score: 0.9, // High original score
            tool: { id: 'tool-0', name: 'Tool 0', category: 'cli' },
          } as QueryResultItem,
          {
            type: 'guideline',
            id: 'guideline-1',
            score: 0.8, // Lower original score
            guideline: { id: 'guideline-1', name: 'Guideline 1', category: 'code_style' },
          } as QueryResultItem,
        ],
      });

      const result = (await stage(ctx)) as CrossEncoderPipelineContext;

      // guideline-1 should now be first due to better cross score
      expect(result.results[0].id).toBe('guideline-1');
    });

    it('should handle LLM errors gracefully', async () => {
      const llmService = createMockLLMService({
        scoreRelevance: vi.fn().mockRejectedValue(new Error('LLM service error')),
      });
      const deps = createMockDeps({ llmService });
      const stage = createCrossEncoderStage(deps);
      const mockLogger = { debug: vi.fn() };
      const ctx = createMockContext({
        deps: { logger: mockLogger } as any,
      });

      const result = await stage(ctx);

      // Should return original context without cross-encoder metadata
      expect((result as CrossEncoderPipelineContext).crossEncoder).toBeUndefined();
    });

    it('should preserve pass-through results', async () => {
      const deps = createMockDeps({
        config: { enabled: true, topK: 3 },
      });
      const stage = createCrossEncoderStage(deps);
      const ctx = createMockContext({ results: createMockResults(10) });

      const result = (await stage(ctx)) as CrossEncoderPipelineContext;

      // Should have all 10 results
      expect(result.results.length).toBe(10);
    });

    it('should respect useCrossEncoder param override', async () => {
      const llmService = createMockLLMService();
      const deps = createMockDeps({
        llmService,
        config: { enabled: false }, // Globally disabled
      });
      const stage = createCrossEncoderStage(deps);
      const ctx = createMockContext({
        params: { useCrossEncoder: true, limit: 20 }, // But enabled per-query
      });

      await stage(ctx);

      expect(llmService.scoreRelevance).toHaveBeenCalled();
    });

    it('should extract text from tool items with version', async () => {
      const llmService = createMockLLMService();
      const deps = createMockDeps({ llmService });
      const stage = createCrossEncoderStage(deps);

      const ctx = createMockContext({
        results: [
          {
            type: 'tool',
            id: 'tool-1',
            score: 0.9,
            tool: { id: 'tool-1', name: 'My Tool', category: 'cli' },
            version: { description: 'A helpful tool description' },
          } as QueryResultItem,
        ],
      });

      await stage(ctx);

      const callArgs = (llmService.scoreRelevance as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1][0].text).toContain('My Tool');
      expect(callArgs[1][0].text).toContain('cli');
      expect(callArgs[1][0].text).toContain('A helpful tool description');
    });

    it('should extract text from guideline items with version', async () => {
      const llmService = createMockLLMService();
      const deps = createMockDeps({ llmService });
      const stage = createCrossEncoderStage(deps);

      const ctx = createMockContext({
        results: [
          {
            type: 'guideline',
            id: 'guideline-1',
            score: 0.9,
            guideline: { id: 'guideline-1', name: 'My Guideline', category: 'security' },
            version: { content: 'Guideline content', rationale: 'Because security' },
          } as QueryResultItem,
        ],
      });

      await stage(ctx);

      const callArgs = (llmService.scoreRelevance as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1][0].text).toContain('My Guideline');
      expect(callArgs[1][0].text).toContain('Guideline content');
      expect(callArgs[1][0].text).toContain('Because security');
    });

    it('should extract text from knowledge items with version', async () => {
      const llmService = createMockLLMService();
      const deps = createMockDeps({ llmService });
      const stage = createCrossEncoderStage(deps);

      const ctx = createMockContext({
        results: [
          {
            type: 'knowledge',
            id: 'knowledge-1',
            score: 0.9,
            knowledge: { id: 'knowledge-1', title: 'My Knowledge', category: 'decision' },
            version: { content: 'Knowledge content', source: 'documentation' },
          } as QueryResultItem,
        ],
      });

      await stage(ctx);

      const callArgs = (llmService.scoreRelevance as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1][0].text).toContain('My Knowledge');
      expect(callArgs[1][0].text).toContain('Knowledge content');
      expect(callArgs[1][0].text).toContain('documentation');
    });

    it('should extract text from experience items with version', async () => {
      const llmService = createMockLLMService();
      const deps = createMockDeps({ llmService });
      const stage = createCrossEncoderStage(deps);

      const ctx = createMockContext({
        results: [
          {
            type: 'experience',
            id: 'experience-1',
            score: 0.9,
            experience: { id: 'experience-1', title: 'My Experience', category: 'debugging' },
            version: { content: 'Experience content', scenario: 'Bug fix', outcome: 'Success' },
          } as QueryResultItem,
        ],
      });

      await stage(ctx);

      const callArgs = (llmService.scoreRelevance as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1][0].text).toContain('My Experience');
      expect(callArgs[1][0].text).toContain('Experience content');
      expect(callArgs[1][0].text).toContain('Bug fix');
      expect(callArgs[1][0].text).toContain('Success');
    });

    it('should handle missing cross score in scoreMap', async () => {
      const llmService = createMockLLMService({
        scoreRelevance: vi.fn().mockResolvedValue([]), // Return empty scores
      });
      const deps = createMockDeps({ llmService });
      const stage = createCrossEncoderStage(deps);
      const ctx = createMockContext({
        results: [
          {
            type: 'tool',
            id: 'tool-1',
            score: 0.9,
            tool: { id: 'tool-1', name: 'Tool', category: 'cli' },
          } as QueryResultItem,
        ],
      });

      const result = (await stage(ctx)) as CrossEncoderPipelineContext;

      // Should use 0 for missing score and blend
      // Blended = 0.6 * 0 + 0.4 * 0.9 = 0.36
      expect(result.results[0].score).toBeCloseTo(0.36, 1);
    });
  });

  describe('buildScoringPrompt', () => {
    it('should build a prompt with query and documents', () => {
      const prompt = buildScoringPrompt('What is authentication?', [
        { id: 'doc1', text: 'Authentication is the process...' },
        { id: 'doc2', text: 'Security best practices...' },
      ]);

      expect(prompt).toContain('What is authentication?');
      expect(prompt).toContain('doc1');
      expect(prompt).toContain('Authentication is the process...');
      expect(prompt).toContain('doc2');
      expect(prompt).toContain('Security best practices...');
    });

    it('should include scoring instructions', () => {
      const prompt = buildScoringPrompt('test query', [{ id: 'doc1', text: 'test text' }]);

      expect(prompt).toContain('SCORING');
      expect(prompt).toContain('JSON');
    });
  });

  describe('buildEntityAwareScoringPrompt', () => {
    it('should include entity verification instructions', () => {
      const prompt = buildEntityAwareScoringPrompt('What did Caroline do?', [
        { id: 'doc1', text: 'Caroline went to the park' },
      ]);

      expect(prompt).toContain('ENTITY');
      expect(prompt).toContain('Caroline');
      expect(prompt).toContain('mismatch');
    });

    it('should number documents correctly', () => {
      const prompt = buildEntityAwareScoringPrompt('query', [
        { id: 'doc1', text: 'text1' },
        { id: 'doc2', text: 'text2' },
        { id: 'doc3', text: 'text3' },
      ]);

      expect(prompt).toContain('[DOC1]');
      expect(prompt).toContain('[DOC2]');
      expect(prompt).toContain('[DOC3]');
    });

    it('should include scoring scale', () => {
      const prompt = buildEntityAwareScoringPrompt('query', [{ id: 'doc1', text: 'text' }]);

      expect(prompt).toContain('10:');
      expect(prompt).toContain('7-9:');
      expect(prompt).toContain('4-6:');
      expect(prompt).toContain('1-3:');
      expect(prompt).toContain('0:');
    });
  });

  describe('parseScoresResponse', () => {
    it('should parse valid JSON response', () => {
      const response = '[{"id": "doc1", "score": 8}, {"id": "doc2", "score": 5}]';
      const result = parseScoresResponse(response, ['doc1', 'doc2']);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('doc1');
      expect(result[0].score).toBeCloseTo(0.8, 2); // Normalized from 0-10
      expect(result[1].id).toBe('doc2');
      expect(result[1].score).toBeCloseTo(0.5, 2);
    });

    it('should handle JSON embedded in text', () => {
      const response = 'Here are the scores:\n[{"id": "doc1", "score": 7}]\nThat is all.';
      const result = parseScoresResponse(response, ['doc1']);

      expect(result).toHaveLength(1);
      expect(result[0].score).toBeCloseTo(0.7, 2);
    });

    it('should return zero scores for invalid JSON', () => {
      const response = 'This is not JSON at all';
      const result = parseScoresResponse(response, ['doc1', 'doc2']);

      expect(result).toHaveLength(2);
      expect(result[0].score).toBe(0);
      expect(result[1].score).toBe(0);
    });

    it('should normalize 0-100 scale scores', () => {
      const response = '[{"id": "doc1", "score": 80}, {"id": "doc2", "score": 50}]';
      const result = parseScoresResponse(response, ['doc1', 'doc2']);

      expect(result[0].score).toBeCloseTo(0.8, 2);
      expect(result[1].score).toBeCloseTo(0.5, 2);
    });

    it('should normalize 0-5 scale scores', () => {
      const response = '[{"id": "doc1", "score": 4}, {"id": "doc2", "score": 2.5}]';
      const result = parseScoresResponse(response, ['doc1', 'doc2']);

      expect(result[0].score).toBeCloseTo(0.8, 2);
      expect(result[1].score).toBeCloseTo(0.5, 2);
    });

    it('should clamp scores to 0-1 range', () => {
      const response = '[{"id": "doc1", "score": 15}]'; // Over 10
      const result = parseScoresResponse(response, ['doc1']);

      expect(result[0].score).toBeLessThanOrEqual(1);
    });

    it('should handle missing scores in items', () => {
      const response = '[{"id": "doc1"}, {"id": "doc2", "score": 5}]';
      const result = parseScoresResponse(response, ['doc1', 'doc2']);

      // Missing score: Number(undefined) = NaN, so it defaults to 0.5
      expect(result[0].score).toBe(0.5);
      // With max=5, divisor=5 (detected as 0-5 scale), so 5/5=1.0
      expect(result[1].score).toBeCloseTo(1.0, 2);
    });

    it('should handle NaN scores', () => {
      const response = '[{"id": "doc1", "score": "not a number"}]';
      const result = parseScoresResponse(response, ['doc1']);

      expect(result[0].score).toBe(0.5); // NaN defaults to 0.5
    });

    it('should return zero scores when no JSON array found', () => {
      // No square brackets, so regex fails to find JSON array
      const response = '{"broken": "json object not array"}';
      const result = parseScoresResponse(response, ['doc1', 'doc2']);

      expect(result).toHaveLength(2);
      expect(result[0].score).toBe(0);
      expect(result[1].score).toBe(0);
    });

    it('should return neutral scores on JSON parse error', () => {
      // Has square brackets but invalid JSON inside
      const response = '[invalid json content]';
      const result = parseScoresResponse(response, ['doc1', 'doc2']);

      expect(result).toHaveLength(2);
      expect(result[0].score).toBe(0.5);
      expect(result[1].score).toBe(0.5);
    });

    it('should return neutral scores for empty scores array', () => {
      const response = '[]';
      const result = parseScoresResponse(response, ['doc1']);

      expect(result[0].score).toBe(0.5);
    });
  });

  describe('createOpenAICrossEncoderService', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    const originalFetch = global.fetch;

    beforeEach(() => {
      fetchMock = vi.fn();
      global.fetch = fetchMock;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should create a service with isAvailable returning true', () => {
      const service = createOpenAICrossEncoderService({
        baseUrl: 'http://localhost:1234/v1',
        model: 'test-model',
      });

      expect(service.isAvailable()).toBe(true);
    });

    it('should return empty array for empty documents', async () => {
      const service = createOpenAICrossEncoderService({
        baseUrl: 'http://localhost:1234/v1',
        model: 'test-model',
      });

      const result = await service.scoreRelevance('query', []);

      expect(result).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should call LLM API with correct parameters', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '[{"id": "doc1", "score": 8}]' } }],
        }),
      });

      const service = createOpenAICrossEncoderService({
        baseUrl: 'http://localhost:1234/v1',
        model: 'test-model',
        apiKey: 'test-key',
        temperature: 0.2,
      });

      await service.scoreRelevance('test query', [{ id: 'doc1', text: 'test text' }]);

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:1234/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          }),
          body: expect.stringContaining('test-model'),
        })
      );

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.temperature).toBe(0.2);
    });

    it('should include reasoning_effort when provided', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '[{"id": "doc1", "score": 8}]' } }],
        }),
      });

      const service = createOpenAICrossEncoderService({
        baseUrl: 'http://localhost:1234/v1',
        model: 'test-model',
        reasoningEffort: 'high',
      });

      await service.scoreRelevance('query', [{ id: 'doc1', text: 'text' }]);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.reasoning_effort).toBe('high');
    });

    it('should handle API errors and set available to false', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const service = createOpenAICrossEncoderService({
        baseUrl: 'http://localhost:1234/v1',
        model: 'test-model',
      });

      await expect(service.scoreRelevance('query', [{ id: 'doc1', text: 'text' }])).rejects.toThrow(
        'LLM API error: 500'
      );

      expect(service.isAvailable()).toBe(false);
    });

    it('should throw on missing choices in response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const service = createOpenAICrossEncoderService({
        baseUrl: 'http://localhost:1234/v1',
        model: 'test-model',
      });

      await expect(service.scoreRelevance('query', [{ id: 'doc1', text: 'text' }])).rejects.toThrow(
        'missing choices'
      );
    });

    it('should throw on missing message content', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: {} }],
        }),
      });

      const service = createOpenAICrossEncoderService({
        baseUrl: 'http://localhost:1234/v1',
        model: 'test-model',
      });

      await expect(service.scoreRelevance('query', [{ id: 'doc1', text: 'text' }])).rejects.toThrow(
        'missing message content'
      );
    });

    it('should handle timeout errors', async () => {
      fetchMock.mockImplementation(() => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const service = createOpenAICrossEncoderService({
        baseUrl: 'http://localhost:1234/v1',
        model: 'test-model',
        timeoutMs: 100,
      });

      await expect(service.scoreRelevance('query', [{ id: 'doc1', text: 'text' }])).rejects.toThrow(
        'timed out'
      );
    });

    it('should parse and return scores from response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            { message: { content: '[{"id": "doc1", "score": 9}, {"id": "doc2", "score": 6}]' } },
          ],
        }),
      });

      const service = createOpenAICrossEncoderService({
        baseUrl: 'http://localhost:1234/v1',
        model: 'test-model',
      });

      const result = await service.scoreRelevance('query', [
        { id: 'doc1', text: 'text1' },
        { id: 'doc2', text: 'text2' },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('doc1');
      expect(result[0].score).toBeCloseTo(0.9, 2);
      expect(result[1].id).toBe('doc2');
      expect(result[1].score).toBeCloseTo(0.6, 2);
    });
  });
});
