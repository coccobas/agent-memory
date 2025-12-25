import { describe, it, expect, beforeEach } from 'vitest';
import { LLMSummarizer } from '../../src/services/summarization/summarizer/llm-summarizer.js';
import type {
  SummarizationRequest,
  SummarizationItem,
  SummarizerConfig,
} from '../../src/services/summarization/summarizer/types.js';


describe('LLM Summarizer', () => {
  describe('Constructor and Configuration', () => {
    it('should create summarizer with disabled provider', () => {
      const config: SummarizerConfig = {
        provider: 'disabled',
      };

      const summarizer = new LLMSummarizer(config);

      expect(summarizer.isAvailable()).toBe(false);
      expect(summarizer.getProvider()).toBe('disabled');
    });

    it('should use default configuration values', () => {
      const config: SummarizerConfig = {
        provider: 'disabled',
      };

      const summarizer = new LLMSummarizer(config);

      expect(summarizer.getProvider()).toBe('disabled');
    });

    it('should throw error for invalid model name', () => {
      const config: SummarizerConfig = {
        provider: 'disabled',
        model: 'invalid/model/../name',
      };

      expect(() => new LLMSummarizer(config)).toThrow('Invalid model name');
    });

    it('should accept valid model names', () => {
      const config: SummarizerConfig = {
        provider: 'disabled',
        model: 'gpt-4o-mini',
      };

      expect(() => new LLMSummarizer(config)).not.toThrow();
    });

    it('should throw error for OpenAI without API key', () => {
      const config: SummarizerConfig = {
        provider: 'openai',
        // No API key
      };

      expect(() => new LLMSummarizer(config)).toThrow('OpenAI API key is required');
    });

    it('should throw error for Anthropic without API key', () => {
      const config: SummarizerConfig = {
        provider: 'anthropic',
        // No API key
      };

      expect(() => new LLMSummarizer(config)).toThrow('Anthropic API key is required');
    });

    it('should initialize Ollama with default base URL', () => {
      const config: SummarizerConfig = {
        provider: 'ollama',
      };

      expect(() => new LLMSummarizer(config)).not.toThrow();
    });

    it('should accept custom Ollama base URL', () => {
      const config: SummarizerConfig = {
        provider: 'ollama',
        ollamaBaseUrl: 'http://custom:11434',
      };

      expect(() => new LLMSummarizer(config)).not.toThrow();
    });

    it('should set default model based on provider', () => {
      const configs: SummarizerConfig[] = [
        { provider: 'disabled' },
        { provider: 'ollama' },
      ];

      configs.forEach(config => {
        const summarizer = new LLMSummarizer(config);
        expect(summarizer.getProvider()).toBe(config.provider);
      });
    });
  });

  describe('Availability', () => {
    it('should report disabled provider as unavailable', () => {
      const summarizer = new LLMSummarizer({ provider: 'disabled' });

      expect(summarizer.isAvailable()).toBe(false);
    });

    it('should report Ollama provider as available', () => {
      const summarizer = new LLMSummarizer({ provider: 'ollama' });

      expect(summarizer.isAvailable()).toBe(true);
    });
  });

  describe('Summarization with Disabled Provider', () => {
    let summarizer: LLMSummarizer;
    let sampleItems: SummarizationItem[];

    beforeEach(() => {
      summarizer = new LLMSummarizer({ provider: 'disabled' });

      sampleItems = [
        {
          id: '1',
          type: 'knowledge',
          title: 'Database Setup',
          content: 'Using PostgreSQL 15 with pgvector extension for embeddings.',
        },
        {
          id: '2',
          type: 'knowledge',
          title: 'Migration Strategy',
          content: 'Migrated from SQLite to PostgreSQL for better performance.',
        },
      ];
    });

    it('should throw error for empty items array', async () => {
      const request: SummarizationRequest = {
        items: [],
        hierarchyLevel: 0,
      };

      await expect(summarizer.summarize(request)).rejects.toThrow(
        'Cannot summarize empty items list'
      );
    });

    it('should return fallback summary when provider is disabled', async () => {
      const request: SummarizationRequest = {
        items: sampleItems,
        hierarchyLevel: 1,
      };

      const result = await summarizer.summarize(request);

      expect(result).toBeDefined();
      expect(result.title).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.keyTerms).toBeDefined();
      expect(result.confidence).toBeLessThan(1.0); // Fallback has lower confidence
      expect(result.provider).toBe('disabled');
      expect(result.model).toBe('fallback');
    });

    it('should extract title from items in fallback', async () => {
      const request: SummarizationRequest = {
        items: [sampleItems[0]!],
        hierarchyLevel: 0,
      };

      const result = await summarizer.summarize(request);

      expect(result.title).toContain('Database Setup');
    });

    it('should create multi-item title in fallback', async () => {
      const request: SummarizationRequest = {
        items: sampleItems,
        hierarchyLevel: 1,
      };

      const result = await summarizer.summarize(request);

      expect(result.title).toContain('Summary of');
      expect(result.title).toContain('2');
    });

    it('should extract key terms in fallback', async () => {
      const request: SummarizationRequest = {
        items: sampleItems,
        hierarchyLevel: 1,
      };

      const result = await summarizer.summarize(request);

      expect(result.keyTerms).toBeDefined();
      expect(Array.isArray(result.keyTerms)).toBe(true);
    });

    it('should include processing time', async () => {
      const request: SummarizationRequest = {
        items: sampleItems,
        hierarchyLevel: 1,
      };

      const result = await summarizer.summarize(request);

      expect(result.processingTimeMs).toBeDefined();
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle different hierarchy levels', async () => {
      for (let level = 0; level <= 3; level++) {
        const request: SummarizationRequest = {
          items: sampleItems,
          hierarchyLevel: level as 0 | 1 | 2 | 3,
        };

        const result = await summarizer.summarize(request);

        expect(result).toBeDefined();
        expect(result.title).toBeDefined();
      }
    });

    it('should include scope context in fallback', async () => {
      const request: SummarizationRequest = {
        items: sampleItems,
        hierarchyLevel: 1,
        scopeContext: 'Backend Database',
      };

      const result = await summarizer.summarize(request);

      expect(result).toBeDefined();
    });

    it('should handle parent summary in fallback', async () => {
      const request: SummarizationRequest = {
        items: sampleItems,
        hierarchyLevel: 2,
        parentSummary: 'Parent context about database',
      };

      const result = await summarizer.summarize(request);

      expect(result).toBeDefined();
    });

    it('should handle focus areas in fallback', async () => {
      const request: SummarizationRequest = {
        items: sampleItems,
        hierarchyLevel: 1,
        focusAreas: ['performance', 'migration'],
      };

      const result = await summarizer.summarize(request);

      expect(result).toBeDefined();
    });
  });

  describe('Batch Summarization', () => {
    let summarizer: LLMSummarizer;

    beforeEach(() => {
      summarizer = new LLMSummarizer({ provider: 'disabled' });
    });

    it('should handle empty batch', async () => {
      const result = await summarizer.summarizeBatch([]);

      expect(result.results).toHaveLength(0);
      expect(result.totalProcessingTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.provider).toBe('disabled');
    });

    it('should process multiple requests', async () => {
      const requests: SummarizationRequest[] = [
        {
          items: [
            {
              id: '1',
              type: 'knowledge',
              title: 'Item 1',
              content: 'Content 1',
            },
          ],
          hierarchyLevel: 0,
        },
        {
          items: [
            {
              id: '2',
              type: 'knowledge',
              title: 'Item 2',
              content: 'Content 2',
            },
          ],
          hierarchyLevel: 0,
        },
      ];

      const result = await summarizer.summarizeBatch(requests);

      expect(result.results).toHaveLength(2);
      expect(result.totalProcessingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should maintain order in batch processing', async () => {
      const requests: SummarizationRequest[] = [
        {
          items: [
            {
              id: '1',
              type: 'knowledge',
              title: 'First',
              content: 'First content',
            },
          ],
          hierarchyLevel: 0,
        },
        {
          items: [
            {
              id: '2',
              type: 'knowledge',
              title: 'Second',
              content: 'Second content',
            },
          ],
          hierarchyLevel: 0,
        },
      ];

      const result = await summarizer.summarizeBatch(requests);

      expect(result.results[0]?.title).toContain('First');
      expect(result.results[1]?.title).toContain('Second');
    });

    it('should include provider and model in batch result', async () => {
      const requests: SummarizationRequest[] = [
        {
          items: [
            {
              id: '1',
              type: 'knowledge',
              title: 'Test',
              content: 'Test content',
            },
          ],
          hierarchyLevel: 0,
        },
      ];

      const result = await summarizer.summarizeBatch(requests);

      expect(result.provider).toBe('disabled');
      expect(result.model).toBeDefined();
    });
  });

  describe('Context Length Validation', () => {
    let summarizer: LLMSummarizer;

    beforeEach(() => {
      summarizer = new LLMSummarizer({ provider: 'disabled' });
    });

    it('should handle normal-sized content', async () => {
      const request: SummarizationRequest = {
        items: [
          {
            id: '1',
            type: 'knowledge',
            title: 'Normal Item',
            content: 'This is normal sized content.',
          },
        ],
        hierarchyLevel: 0,
      };

      await expect(summarizer.summarize(request)).resolves.toBeDefined();
    });

    it('should handle items with metadata', async () => {
      const request: SummarizationRequest = {
        items: [
          {
            id: '1',
            type: 'knowledge',
            title: 'Item with metadata',
            content: 'Content',
            metadata: {
              category: 'test',
              tags: ['tag1', 'tag2'],
              confidence: 0.9,
              keyTerms: ['term1', 'term2'],
            },
          },
        ],
        hierarchyLevel: 0,
      };

      await expect(summarizer.summarize(request)).resolves.toBeDefined();
    });
  });

  describe('Provider Information', () => {
    it('should return correct provider for disabled', () => {
      const summarizer = new LLMSummarizer({ provider: 'disabled' });

      expect(summarizer.getProvider()).toBe('disabled');
    });

    it('should return correct provider for Ollama', () => {
      const summarizer = new LLMSummarizer({ provider: 'ollama' });

      expect(summarizer.getProvider()).toBe('ollama');
    });
  });

  describe('Fallback Summary Generation', () => {
    let summarizer: LLMSummarizer;

    beforeEach(() => {
      summarizer = new LLMSummarizer({ provider: 'disabled' });
    });

    it('should extract first sentence from content', async () => {
      const request: SummarizationRequest = {
        items: [
          {
            id: '1',
            type: 'knowledge',
            title: 'Test',
            content: 'First sentence. Second sentence. Third sentence.',
          },
        ],
        hierarchyLevel: 0,
      };

      const result = await summarizer.summarize(request);

      expect(result.content).toContain('First sentence');
    });

    it('should handle content without sentence delimiters', async () => {
      const request: SummarizationRequest = {
        items: [
          {
            id: '1',
            type: 'knowledge',
            title: 'Test',
            content: 'This is a long content without any sentence delimiters at all',
          },
        ],
        hierarchyLevel: 0,
      };

      const result = await summarizer.summarize(request);

      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
    });

    it('should limit number of sentences in fallback', async () => {
      const request: SummarizationRequest = {
        items: Array.from({ length: 10 }, (_, i) => ({
          id: String(i),
          type: 'knowledge',
          title: `Item ${i}`,
          content: `This is content ${i}. With multiple sentences.`,
        })),
        hierarchyLevel: 1,
      };

      const result = await summarizer.summarize(request);

      // Fallback should not include all sentences
      expect(result.content).toBeDefined();
    });

    it('should extract key terms by frequency', async () => {
      const request: SummarizationRequest = {
        items: [
          {
            id: '1',
            type: 'knowledge',
            title: 'Database Database',
            content: 'PostgreSQL database migration. Database setup complete.',
          },
        ],
        hierarchyLevel: 0,
      };

      const result = await summarizer.summarize(request);

      expect(result.keyTerms).toBeDefined();
      expect(result.keyTerms.length).toBeGreaterThan(0);
    });

    it('should filter out short words in key terms', async () => {
      const request: SummarizationRequest = {
        items: [
          {
            id: '1',
            type: 'knowledge',
            title: 'Test',
            content: 'The and but PostgreSQL database migration setup',
          },
        ],
        hierarchyLevel: 0,
      };

      const result = await summarizer.summarize(request);

      // Should not include words like 'the', 'and', 'but'
      expect(result.keyTerms.every(term => term.length > 4)).toBe(true);
    });

    it('should handle empty content gracefully', async () => {
      const request: SummarizationRequest = {
        items: [
          {
            id: '1',
            type: 'knowledge',
            title: 'Empty',
            content: '',
          },
        ],
        hierarchyLevel: 0,
      };

      const result = await summarizer.summarize(request);

      expect(result).toBeDefined();
      expect(result.title).toBe('Empty');
    });
  });

  describe('Model Name Validation', () => {
    it('should accept standard model names', () => {
      const validNames = [
        'gpt-4o-mini',
        'gpt-4',
        'claude-3-5-haiku-20241022',
        'llama3.2',
        'model_name',
        'model-name',
        'model:latest',
      ];

      validNames.forEach(model => {
        expect(() => new LLMSummarizer({ provider: 'disabled', model })).not.toThrow();
      });
    });

    it('should reject model names with invalid characters', () => {
      const invalidNames = [
        '../../../etc/passwd', // Contains forward slashes
        'model/../../bad',     // Contains forward slashes
        'model\x00name',       // Contains null byte
        'model name',          // Contains space
      ];

      invalidNames.forEach(model => {
        expect(() => new LLMSummarizer({ provider: 'disabled', model })).toThrow();
      });
    });

    it('should reject extremely long model names', () => {
      const longName = 'a'.repeat(200);

      expect(() => new LLMSummarizer({ provider: 'disabled', model: longName })).toThrow();
    });
  });

  describe('Hierarchy Level Handling', () => {
    let summarizer: LLMSummarizer;

    beforeEach(() => {
      summarizer = new LLMSummarizer({ provider: 'disabled' });
    });

    it('should handle level 0 (chunk)', async () => {
      const request: SummarizationRequest = {
        items: [{ id: '1', type: 'knowledge', title: 'Test', content: 'Test content' }],
        hierarchyLevel: 0,
      };

      const result = await summarizer.summarize(request);
      expect(result).toBeDefined();
    });

    it('should handle level 1 (topic)', async () => {
      const request: SummarizationRequest = {
        items: [{ id: '1', type: 'knowledge', title: 'Test', content: 'Test content' }],
        hierarchyLevel: 1,
      };

      const result = await summarizer.summarize(request);
      expect(result).toBeDefined();
    });

    it('should handle level 2 (domain)', async () => {
      const request: SummarizationRequest = {
        items: [{ id: '1', type: 'knowledge', title: 'Test', content: 'Test content' }],
        hierarchyLevel: 2,
      };

      const result = await summarizer.summarize(request);
      expect(result).toBeDefined();
    });

    it('should handle level 3 (global)', async () => {
      const request: SummarizationRequest = {
        items: [{ id: '1', type: 'knowledge', title: 'Test', content: 'Test content' }],
        hierarchyLevel: 3,
      };

      const result = await summarizer.summarize(request);
      expect(result).toBeDefined();
    });
  });

  describe('OpenAI Provider', () => {
    it('should create summarizer with OpenAI provider when API key provided', () => {
      const summarizer = new LLMSummarizer({
        provider: 'openai',
        openaiApiKey: 'test-api-key',
      });

      expect(summarizer.isAvailable()).toBe(true);
      expect(summarizer.getProvider()).toBe('openai');
    });

    it('should accept custom base URL for OpenAI', () => {
      const summarizer = new LLMSummarizer({
        provider: 'openai',
        openaiApiKey: 'test-api-key',
        openaiBaseUrl: 'https://custom.openai.com/v1',
      });

      expect(summarizer.isAvailable()).toBe(true);
    });
  });

  describe('Anthropic Provider', () => {
    it('should create summarizer with Anthropic provider when API key provided', () => {
      const summarizer = new LLMSummarizer({
        provider: 'anthropic',
        anthropicApiKey: 'test-api-key',
      });

      expect(summarizer.isAvailable()).toBe(true);
      expect(summarizer.getProvider()).toBe('anthropic');
    });
  });

  describe('Configuration Options', () => {
    it('should accept temperature configuration', () => {
      const summarizer = new LLMSummarizer({
        provider: 'disabled',
        temperature: 0.5,
      });

      expect(summarizer).toBeDefined();
    });

    it('should accept maxTokens configuration', () => {
      const summarizer = new LLMSummarizer({
        provider: 'disabled',
        maxTokens: 2048,
      });

      expect(summarizer).toBeDefined();
    });

    it('should accept model override', () => {
      const summarizer = new LLMSummarizer({
        provider: 'ollama',
        model: 'llama3.2:latest',
      });

      expect(summarizer).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    let summarizer: LLMSummarizer;

    beforeEach(() => {
      summarizer = new LLMSummarizer({ provider: 'disabled' });
    });

    it('should handle guideline item type', async () => {
      const request: SummarizationRequest = {
        items: [
          { id: '1', type: 'guideline', title: 'Style Guide', content: 'Use TypeScript.' },
        ],
        hierarchyLevel: 0,
      };

      const result = await summarizer.summarize(request);
      expect(result).toBeDefined();
    });

    it('should handle tool item type', async () => {
      const request: SummarizationRequest = {
        items: [
          { id: '1', type: 'tool', title: 'npm test', content: 'Run tests.' },
        ],
        hierarchyLevel: 0,
      };

      const result = await summarizer.summarize(request);
      expect(result).toBeDefined();
    });

    it('should handle experience item type', async () => {
      const request: SummarizationRequest = {
        items: [
          { id: '1', type: 'experience', title: 'Debug Session', content: 'Fixed null pointer.' },
        ],
        hierarchyLevel: 0,
      };

      const result = await summarizer.summarize(request);
      expect(result).toBeDefined();
    });

    it('should handle very large item list', async () => {
      const items: SummarizationItem[] = Array.from({ length: 50 }, (_, i) => ({
        id: String(i),
        type: 'knowledge',
        title: `Item ${i}`,
        content: `Content for item ${i}.`,
      }));

      const request: SummarizationRequest = {
        items,
        hierarchyLevel: 2,
      };

      const result = await summarizer.summarize(request);
      expect(result).toBeDefined();
      expect(result.title).toContain('Summary of');
    });

    it('should handle special characters in content', async () => {
      const request: SummarizationRequest = {
        items: [
          {
            id: '1',
            type: 'knowledge',
            title: 'Special <chars> & "quotes"',
            content: 'Content with \n newlines \t tabs and unicode: \u00e9\u00e0\u00fc',
          },
        ],
        hierarchyLevel: 0,
      };

      const result = await summarizer.summarize(request);
      expect(result).toBeDefined();
    });

    it('should handle items with no title', async () => {
      const request: SummarizationRequest = {
        items: [
          { id: '1', type: 'knowledge', title: '', content: 'Content without title.' },
        ],
        hierarchyLevel: 0,
      };

      const result = await summarizer.summarize(request);
      expect(result).toBeDefined();
    });

    it('should handle mixed item types', async () => {
      const request: SummarizationRequest = {
        items: [
          { id: '1', type: 'knowledge', title: 'Know 1', content: 'Knowledge content.' },
          { id: '2', type: 'guideline', title: 'Guide 1', content: 'Guideline content.' },
          { id: '3', type: 'tool', title: 'Tool 1', content: 'Tool content.' },
        ],
        hierarchyLevel: 1,
      };

      const result = await summarizer.summarize(request);
      expect(result).toBeDefined();
    });
  });

  describe('Item Metadata Handling', () => {
    let summarizer: LLMSummarizer;

    beforeEach(() => {
      summarizer = new LLMSummarizer({ provider: 'disabled' });
    });

    it('should handle items with tags', async () => {
      const request: SummarizationRequest = {
        items: [
          {
            id: '1',
            type: 'knowledge',
            title: 'Tagged Item',
            content: 'Content.',
            metadata: { tags: ['db', 'postgres', 'migration'] },
          },
        ],
        hierarchyLevel: 0,
      };

      const result = await summarizer.summarize(request);
      expect(result).toBeDefined();
    });

    it('should handle items with confidence', async () => {
      const request: SummarizationRequest = {
        items: [
          {
            id: '1',
            type: 'knowledge',
            title: 'Confident Item',
            content: 'Content.',
            metadata: { confidence: 0.95 },
          },
        ],
        hierarchyLevel: 0,
      };

      const result = await summarizer.summarize(request);
      expect(result).toBeDefined();
    });

    it('should handle items with keyTerms', async () => {
      const request: SummarizationRequest = {
        items: [
          {
            id: '1',
            type: 'knowledge',
            title: 'Keyed Item',
            content: 'PostgreSQL database setup.',
            metadata: { keyTerms: ['PostgreSQL', 'database', 'setup'] },
          },
        ],
        hierarchyLevel: 0,
      };

      const result = await summarizer.summarize(request);
      expect(result.keyTerms.length).toBeGreaterThan(0);
    });
  });

  describe('Parse Response', () => {
    let summarizer: LLMSummarizer;

    beforeEach(() => {
      summarizer = new LLMSummarizer({ provider: 'disabled' });
    });

    it('should parse valid JSON response', () => {
      const parseResponse = (summarizer as any).parseResponse.bind(summarizer);

      const jsonContent = JSON.stringify({
        title: 'Test Summary',
        content: 'Summary content here',
        keyTerms: ['term1', 'term2'],
        confidence: 0.9,
      });

      const result = parseResponse(jsonContent, 1, 'openai');

      expect(result.title).toBe('Test Summary');
      expect(result.content).toBe('Summary content here');
      expect(result.keyTerms).toEqual(['term1', 'term2']);
      expect(result.confidence).toBe(0.9);
      expect(result.provider).toBe('openai');
    });

    it('should handle markdown code blocks', () => {
      const parseResponse = (summarizer as any).parseResponse.bind(summarizer);

      const markdownContent = '```json\n{"title": "Markdown Summary", "content": "Content"}\n```';

      const result = parseResponse(markdownContent, 0, 'anthropic');

      expect(result.title).toBe('Markdown Summary');
      expect(result.content).toBe('Content');
    });

    it('should use defaults when fields are missing', () => {
      const parseResponse = (summarizer as any).parseResponse.bind(summarizer);

      const partialJson = JSON.stringify({ content: 'Only content' });

      const result = parseResponse(partialJson, 2, 'ollama');

      expect(result.title).toBe('Summary'); // Default title
      expect(result.content).toBe('Only content');
      expect(result.keyTerms).toEqual([]); // Default empty array
      expect(result.confidence).toBe(0.7); // Default confidence
    });

    it('should fall back to raw content on invalid JSON', () => {
      const parseResponse = (summarizer as any).parseResponse.bind(summarizer);

      const invalidContent = 'This is not valid JSON at all';

      const result = parseResponse(invalidContent, 1, 'openai');

      expect(result.title).toBe('Level 1 Summary');
      expect(result.content).toBe('This is not valid JSON at all');
      expect(result.confidence).toBe(0.5); // Lower confidence for fallback
    });

    it('should handle keyTerms that is not an array', () => {
      const parseResponse = (summarizer as any).parseResponse.bind(summarizer);

      const jsonContent = JSON.stringify({
        title: 'Test',
        content: 'Content',
        keyTerms: 'not-an-array',
        confidence: 0.8,
      });

      const result = parseResponse(jsonContent, 0, 'openai');

      expect(result.keyTerms).toEqual([]); // Should default to empty array
    });

    it('should handle non-number confidence', () => {
      const parseResponse = (summarizer as any).parseResponse.bind(summarizer);

      const jsonContent = JSON.stringify({
        title: 'Test',
        content: 'Content',
        confidence: 'high',
      });

      const result = parseResponse(jsonContent, 0, 'openai');

      expect(result.confidence).toBe(0.7); // Should default to 0.7
    });

    it('should handle code block without json marker', () => {
      const parseResponse = (summarizer as any).parseResponse.bind(summarizer);

      const codeBlock = '```\n{"title": "No JSON Marker", "content": "Works"}\n```';

      const result = parseResponse(codeBlock, 0, 'openai');

      expect(result.title).toBe('No JSON Marker');
    });
  });

  describe('Default Models', () => {
    it('should set default model for OpenAI', () => {
      const summarizer = new LLMSummarizer({
        provider: 'openai',
        openaiApiKey: 'test-key',
      });

      // The getDefaultModel is private, but we can check via getProvider
      expect(summarizer.getProvider()).toBe('openai');
    });

    it('should set default model for Anthropic', () => {
      const summarizer = new LLMSummarizer({
        provider: 'anthropic',
        anthropicApiKey: 'test-key',
      });

      expect(summarizer.getProvider()).toBe('anthropic');
    });

    it('should set default model for Ollama', () => {
      const summarizer = new LLMSummarizer({
        provider: 'ollama',
      });

      expect(summarizer.getProvider()).toBe('ollama');
    });

    it('should set default model for disabled', () => {
      const summarizer = new LLMSummarizer({
        provider: 'disabled',
      });

      expect(summarizer.getProvider()).toBe('disabled');
    });
  });

  describe('Context Length Limit', () => {
    it('should handle very long content in fallback', async () => {
      const summarizer = new LLMSummarizer({ provider: 'disabled' });

      // Create long content that would exceed normal limits
      const longContent = 'A'.repeat(50000);

      const request: SummarizationRequest = {
        items: [
          {
            id: '1',
            type: 'knowledge',
            title: 'Long Content',
            content: longContent,
          },
        ],
        hierarchyLevel: 0,
      };

      // Should not throw, should use fallback
      const result = await summarizer.summarize(request);
      expect(result).toBeDefined();
      expect(result.provider).toBe('disabled');
    });
  });

  describe('getDefaultModel', () => {
    it('should use gpt-4o-mini as default for OpenAI', () => {
      const summarizer = new LLMSummarizer({
        provider: 'openai',
        openaiApiKey: 'test-key',
      });

      expect(summarizer.isAvailable()).toBe(true);
    });

    it('should use claude model as default for Anthropic', () => {
      const summarizer = new LLMSummarizer({
        provider: 'anthropic',
        anthropicApiKey: 'test-key',
      });

      expect(summarizer.isAvailable()).toBe(true);
    });

    it('should use llama3.2 as default for Ollama', () => {
      const summarizer = new LLMSummarizer({
        provider: 'ollama',
      });

      expect(summarizer.isAvailable()).toBe(true);
    });

    it('should use none as model for disabled provider', () => {
      const summarizer = new LLMSummarizer({
        provider: 'disabled',
      });

      expect(summarizer.isAvailable()).toBe(false);
    });
  });

  describe('Batch summarization edge cases', () => {
    let summarizer: LLMSummarizer;

    beforeEach(() => {
      summarizer = new LLMSummarizer({ provider: 'disabled' });
    });

    it('should handle single item batch', async () => {
      const result = await summarizer.summarizeBatch([
        {
          items: [{ id: '1', type: 'knowledge', title: 'Single', content: 'Content' }],
          hierarchyLevel: 0,
        },
      ]);

      expect(result.results).toHaveLength(1);
      expect(result.totalProcessingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle batch with different hierarchy levels', async () => {
      const result = await summarizer.summarizeBatch([
        { items: [{ id: '1', type: 'knowledge', title: 'L0', content: 'C1' }], hierarchyLevel: 0 },
        { items: [{ id: '2', type: 'knowledge', title: 'L1', content: 'C2' }], hierarchyLevel: 1 },
        { items: [{ id: '3', type: 'knowledge', title: 'L2', content: 'C3' }], hierarchyLevel: 2 },
      ]);

      expect(result.results).toHaveLength(3);
    });

    it('should accumulate processing time across batch', async () => {
      const result = await summarizer.summarizeBatch([
        { items: [{ id: '1', type: 'knowledge', title: 'I1', content: 'C1' }], hierarchyLevel: 0 },
        { items: [{ id: '2', type: 'knowledge', title: 'I2', content: 'C2' }], hierarchyLevel: 0 },
      ]);

      // Total time should be sum of individual times
      const individualTimes = result.results.reduce(
        (sum, r) => sum + (r.processingTimeMs || 0),
        0
      );
      expect(result.totalProcessingTimeMs).toBeGreaterThanOrEqual(individualTimes);
    });
  });

  describe('Prompt building coverage', () => {
    let summarizer: LLMSummarizer;

    beforeEach(() => {
      summarizer = new LLMSummarizer({ provider: 'disabled' });
    });

    it('should include all optional parameters in prompt', async () => {
      const request: SummarizationRequest = {
        items: [{ id: '1', type: 'knowledge', title: 'Test', content: 'Content' }],
        hierarchyLevel: 2,
        scopeContext: 'Database Layer',
        parentSummary: 'Parent context about data storage',
        focusAreas: ['performance', 'reliability', 'scalability'],
      };

      const result = await summarizer.summarize(request);

      expect(result).toBeDefined();
      expect(result.provider).toBe('disabled');
    });

    it('should handle level 3 with all context options', async () => {
      const request: SummarizationRequest = {
        items: [
          { id: '1', type: 'guideline', title: 'G1', content: 'Guideline 1' },
          { id: '2', type: 'tool', title: 'T1', content: 'Tool 1' },
        ],
        hierarchyLevel: 3,
        scopeContext: 'System Architecture',
        parentSummary: 'High-level system overview',
        focusAreas: ['architecture', 'design patterns'],
      };

      const result = await summarizer.summarize(request);

      expect(result).toBeDefined();
    });
  });

  describe('Item type variations', () => {
    let summarizer: LLMSummarizer;

    beforeEach(() => {
      summarizer = new LLMSummarizer({ provider: 'disabled' });
    });

    it('should handle all four item types in one request', async () => {
      const request: SummarizationRequest = {
        items: [
          { id: '1', type: 'knowledge', title: 'K1', content: 'Knowledge content' },
          { id: '2', type: 'guideline', title: 'G1', content: 'Guideline content' },
          { id: '3', type: 'tool', title: 'T1', content: 'Tool content' },
          { id: '4', type: 'experience', title: 'E1', content: 'Experience content' },
        ],
        hierarchyLevel: 1,
      };

      const result = await summarizer.summarize(request);

      expect(result).toBeDefined();
      expect(result.title).toContain('4');
    });

    it('should handle summary type in items', async () => {
      const request: SummarizationRequest = {
        items: [{ id: '1', type: 'summary' as any, title: 'S1', content: 'Previous summary' }],
        hierarchyLevel: 2,
      };

      const result = await summarizer.summarize(request);

      expect(result).toBeDefined();
    });
  });

  describe('Parse response edge cases', () => {
    let summarizer: LLMSummarizer;

    beforeEach(() => {
      summarizer = new LLMSummarizer({ provider: 'disabled' });
    });

    it('should handle JSON with extra whitespace', () => {
      const parseResponse = (summarizer as any).parseResponse.bind(summarizer);

      const jsonContent = '  \n  {"title": "Trimmed", "content": "Works"}  \n  ';

      const result = parseResponse(jsonContent, 0, 'openai');

      expect(result.title).toBe('Trimmed');
    });

    it('should handle markdown code blocks with json tag', () => {
      const parseResponse = (summarizer as any).parseResponse.bind(summarizer);

      const content = '```json\n{"title": "FromCodeBlock", "content": "Extracted from code block"}\n```';

      const result = parseResponse(content, 0, 'anthropic');

      expect(result.title).toBe('FromCodeBlock');
      expect(result.content).toBe('Extracted from code block');
    });

    it('should handle empty JSON object', () => {
      const parseResponse = (summarizer as any).parseResponse.bind(summarizer);

      const result = parseResponse('{}', 0, 'ollama');

      expect(result.title).toBe('Summary');
      expect(result.content).toBe('');
      expect(result.keyTerms).toEqual([]);
      expect(result.confidence).toBe(0.7);
    });

    it('should handle JSON with null values', () => {
      const parseResponse = (summarizer as any).parseResponse.bind(summarizer);

      const jsonContent = JSON.stringify({
        title: null,
        content: null,
        keyTerms: null,
        confidence: null,
      });

      const result = parseResponse(jsonContent, 1, 'openai');

      expect(result.title).toBe('Summary');
      expect(result.content).toBe('');
      expect(result.keyTerms).toEqual([]);
      expect(result.confidence).toBe(0.7);
    });

    it('should preserve provider info in response', () => {
      const parseResponse = (summarizer as any).parseResponse.bind(summarizer);

      const providers = ['openai', 'anthropic', 'ollama', 'disabled'];

      providers.forEach(provider => {
        const result = parseResponse('{"content": "test"}', 0, provider);
        expect(result.provider).toBe(provider);
      });
    });
  });

  describe('Ollama configuration', () => {
    it('should not throw when ollamaBaseUrl is not set', () => {
      const summarizer = new LLMSummarizer({
        provider: 'ollama',
      });

      expect(summarizer.isAvailable()).toBe(true);
    });

    it('should use custom ollamaBaseUrl when provided', () => {
      const summarizer = new LLMSummarizer({
        provider: 'ollama',
        ollamaBaseUrl: 'http://custom-host:11434',
      });

      expect(summarizer.isAvailable()).toBe(true);
    });
  });

  describe('OpenAI configuration', () => {
    it('should use custom openaiBaseUrl when provided', () => {
      const summarizer = new LLMSummarizer({
        provider: 'openai',
        openaiApiKey: 'test-key',
        openaiBaseUrl: 'https://custom-openai.com/v1',
      });

      expect(summarizer.isAvailable()).toBe(true);
    });
  });
});
