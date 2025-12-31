/**
 * Integration test for atomicity in the extraction pipeline
 *
 * Tests that compound entries returned by the LLM are properly split
 * into atomic entries by the post-extraction validation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExtractionService } from '../../src/services/extraction.service.js';
import { config, snapshotConfig, restoreConfig } from '../../src/config/index.js';

describe('extraction atomicity integration', () => {
  let configSnapshot: ReturnType<typeof snapshotConfig>;

  beforeEach(() => {
    configSnapshot = snapshotConfig();
  });

  afterEach(() => {
    restoreConfig(configSnapshot);
    vi.restoreAllMocks();
  });

  it('splits compound entries from LLM response', async () => {
    // Mock the OpenAI client response to return compound entries
    const mockLLMResponse = {
      guidelines: [
        {
          name: 'compound-rule',
          content: 'Always use TypeScript strict mode; Never use any type; Prefer const over let',
          category: 'code_style',
          priority: 80,
          confidence: 0.9,
          suggestedTags: ['typescript'],
        },
      ],
      knowledge: [
        {
          title: 'Tech Stack',
          content: 'We chose PostgreSQL for persistence. We also decided to use Redis for caching.',
          category: 'decision',
          confidence: 0.85,
          suggestedTags: ['database'],
        },
      ],
      tools: [],
      entities: [],
      relationships: [],
    };

    // Create service with OpenAI provider
    const service = new ExtractionService({
      provider: 'openai',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4o-mini',
      anthropicModel: 'claude-3-5-sonnet-20241022',
      ollamaBaseUrl: 'http://localhost:11434',
      ollamaModel: 'llama3.2',
    });

    // Mock the OpenAI client's create method
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(mockLLMResponse),
          },
        },
      ],
      usage: { total_tokens: 100 },
    });

    // Access private client and mock it
    (service as any).openaiClient = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };

    // Enable atomicity
    config.extraction.atomicityEnabled = true;
    config.extraction.atomicitySplitMode = 'silent';
    config.extraction.atomicityMaxSplits = 5;

    // Run extraction
    const result = await service.extract({
      context: 'Test conversation about coding standards and tech stack decisions.',
      contextType: 'conversation',
    });

    // Verify the compound guideline was split
    const guidelines = result.entries.filter((e) => e.type === 'guideline');
    expect(guidelines.length).toBeGreaterThan(1);

    // Each split entry should contain only one rule
    guidelines.forEach((g) => {
      // Should not contain semicolons (indicating multiple rules)
      expect(g.content).not.toMatch(/;.*[A-Z]/); // No semicolon followed by capital letter
    });

    // Check that names are unique
    const names = guidelines.map((g) => g.name);
    expect(new Set(names).size).toBe(names.length);

    // Verify confidence was slightly reduced for split entries
    guidelines.forEach((g) => {
      expect(g.confidence).toBeLessThanOrEqual(0.9);
      expect(g.confidence).toBeGreaterThan(0.8);
    });
  });

  it('passes through atomic entries unchanged', async () => {
    const mockLLMResponse = {
      guidelines: [
        {
          name: 'atomic-rule',
          content: 'Always use TypeScript strict mode.',
          category: 'code_style',
          priority: 80,
          confidence: 0.9,
          suggestedTags: ['typescript'],
        },
      ],
      knowledge: [],
      tools: [],
      entities: [],
      relationships: [],
    };

    const service = new ExtractionService({
      provider: 'openai',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4o-mini',
      anthropicModel: 'claude-3-5-sonnet-20241022',
      ollamaBaseUrl: 'http://localhost:11434',
      ollamaModel: 'llama3.2',
    });

    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(mockLLMResponse),
          },
        },
      ],
      usage: { total_tokens: 50 },
    });

    (service as any).openaiClient = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };

    config.extraction.atomicityEnabled = true;

    const result = await service.extract({
      context: 'Use TypeScript strict mode for better type safety.',
      contextType: 'conversation',
    });

    // Should have exactly 1 guideline (unchanged)
    const guidelines = result.entries.filter((e) => e.type === 'guideline');
    expect(guidelines).toHaveLength(1);
    expect(guidelines[0].name).toBe('atomic-rule');
    expect(guidelines[0].confidence).toBe(0.9); // Unchanged
  });

  it('respects atomicityEnabled: false', async () => {
    const mockLLMResponse = {
      guidelines: [
        {
          name: 'compound-rule',
          content: 'Do X; Do Y; Do Z',
          category: 'code_style',
          priority: 80,
          confidence: 0.9,
          suggestedTags: [],
        },
      ],
      knowledge: [],
      tools: [],
      entities: [],
      relationships: [],
    };

    const service = new ExtractionService({
      provider: 'openai',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4o-mini',
      anthropicModel: 'claude-3-5-sonnet-20241022',
      ollamaBaseUrl: 'http://localhost:11434',
      ollamaModel: 'llama3.2',
    });

    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(mockLLMResponse),
          },
        },
      ],
      usage: { total_tokens: 50 },
    });

    (service as any).openaiClient = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };

    // Disable atomicity
    config.extraction.atomicityEnabled = false;

    const result = await service.extract({
      context: 'Test context',
      contextType: 'conversation',
    });

    // Should NOT split - return compound entry as-is
    const guidelines = result.entries.filter((e) => e.type === 'guideline');
    expect(guidelines).toHaveLength(1);
    expect(guidelines[0].content).toBe('Do X; Do Y; Do Z');
  });

  it('respects atomicityMaxSplits limit', async () => {
    const mockLLMResponse = {
      guidelines: [
        {
          name: 'many-rules',
          content: 'Rule 1; Rule 2; Rule 3; Rule 4; Rule 5; Rule 6; Rule 7',
          category: 'code_style',
          priority: 80,
          confidence: 0.9,
          suggestedTags: [],
        },
      ],
      knowledge: [],
      tools: [],
      entities: [],
      relationships: [],
    };

    const service = new ExtractionService({
      provider: 'openai',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4o-mini',
      anthropicModel: 'claude-3-5-sonnet-20241022',
      ollamaBaseUrl: 'http://localhost:11434',
      ollamaModel: 'llama3.2',
    });

    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(mockLLMResponse),
          },
        },
      ],
      usage: { total_tokens: 50 },
    });

    (service as any).openaiClient = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };

    config.extraction.atomicityEnabled = true;
    config.extraction.atomicityMaxSplits = 3; // Limit to 3

    const result = await service.extract({
      context: 'Test context',
      contextType: 'conversation',
    });

    // Should not split because 7 parts > maxSplits of 3
    // The atomicity module won't split if result would exceed maxSplits
    const guidelines = result.entries.filter((e) => e.type === 'guideline');
    expect(guidelines.length).toBeLessThanOrEqual(3);
  });
});
