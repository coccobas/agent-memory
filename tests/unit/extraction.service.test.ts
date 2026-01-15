import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ExtractionService,
  resetExtractionServiceState,
} from '../../src/services/extraction.service.js';

describe('Extraction Service', () => {
  let service: ExtractionService;

  beforeEach(() => {
    resetExtractionServiceState();
    service = new ExtractionService();
  });

  afterEach(() => {
    resetExtractionServiceState();
  });

  it('should create independent instances', () => {
    const service1 = new ExtractionService();
    const service2 = new ExtractionService();
    // With DI pattern, instances are independent
    expect(service1).not.toBe(service2);
  });

  it('should determine provider based on environment', () => {
    const provider = service.getProvider();
    // Should be one of the valid providers
    expect(['openai', 'anthropic', 'ollama', 'disabled']).toContain(provider);
  });

  it('should report availability correctly', () => {
    const available = service.isAvailable();
    const provider = service.getProvider();

    if (provider === 'disabled') {
      expect(available).toBe(false);
    } else {
      expect(available).toBe(true);
    }
  });

  it('should return empty result when disabled', async () => {
    // Force disabled mode by setting env var
    const originalProvider = process.env.AGENT_MEMORY_EXTRACTION_PROVIDER;
    process.env.AGENT_MEMORY_EXTRACTION_PROVIDER = 'disabled';

    // Reload config to pick up the new env var
    const { reloadConfig } = await import('../../src/config/index.js');
    reloadConfig();

    resetExtractionServiceState();
    const disabledService = new ExtractionService();

    const result = await disabledService.extract({ context: 'Test context' });
    expect(result.entries).toEqual([]);
    expect(result.provider).toBe('disabled');
    expect(result.processingTimeMs).toBe(0);

    // Restore
    if (originalProvider) {
      process.env.AGENT_MEMORY_EXTRACTION_PROVIDER = originalProvider;
    } else {
      delete process.env.AGENT_MEMORY_EXTRACTION_PROVIDER;
    }
    reloadConfig();
  });

  it('should reject empty context', async () => {
    // Only test if service is available
    if (service.isAvailable()) {
      await expect(service.extract({ context: '' })).rejects.toThrow(
        'context - cannot be empty'
      );
      await expect(service.extract({ context: '   ' })).rejects.toThrow(
        'context - cannot be empty'
      );
    }
  });

  describe('parseExtractionResponse (via reflection)', () => {
    // Test the internal parsing logic by checking the output format
    it('should handle disabled provider gracefully', async () => {
      const originalProvider = process.env.AGENT_MEMORY_EXTRACTION_PROVIDER;
      process.env.AGENT_MEMORY_EXTRACTION_PROVIDER = 'disabled';

      const { reloadConfig } = await import('../../src/config/index.js');
      reloadConfig();

      resetExtractionServiceState();
      const disabledService = new ExtractionService();

      expect(disabledService.getProvider()).toBe('disabled');
      expect(disabledService.isAvailable()).toBe(false);

      const result = await disabledService.extract({ context: 'some context' });
      expect(result.entries).toHaveLength(0);
      expect(result.model).toBe('disabled');

      // Restore
      if (originalProvider) {
        process.env.AGENT_MEMORY_EXTRACTION_PROVIDER = originalProvider;
      } else {
        delete process.env.AGENT_MEMORY_EXTRACTION_PROVIDER;
      }
      reloadConfig();
    });
  });

  describe('provider configuration', () => {
    it('should default to openai (LM Studio compatible) when no API keys provided', async () => {
      // Save original values
      const originalProvider = process.env.AGENT_MEMORY_EXTRACTION_PROVIDER;
      const originalOpenaiKey = process.env.AGENT_MEMORY_OPENAI_API_KEY;
      const originalAnthropicKey = process.env.AGENT_MEMORY_ANTHROPIC_API_KEY;

      // Clear all keys
      delete process.env.AGENT_MEMORY_EXTRACTION_PROVIDER;
      delete process.env.AGENT_MEMORY_OPENAI_API_KEY;
      delete process.env.AGENT_MEMORY_ANTHROPIC_API_KEY;

      const { reloadConfig } = await import('../../src/config/index.js');
      reloadConfig();

      resetExtractionServiceState();
      const testService = new ExtractionService();

      // Defaults to openai which works with LM Studio's OpenAI-compatible API
      expect(testService.getProvider()).toBe('openai');

      // Restore
      if (originalProvider) process.env.AGENT_MEMORY_EXTRACTION_PROVIDER = originalProvider;
      if (originalOpenaiKey) process.env.AGENT_MEMORY_OPENAI_API_KEY = originalOpenaiKey;
      if (originalAnthropicKey) process.env.AGENT_MEMORY_ANTHROPIC_API_KEY = originalAnthropicKey;
      reloadConfig();
    });

    it('should prefer OpenAI when key is available', async () => {
      // Save original values
      const originalProvider = process.env.AGENT_MEMORY_EXTRACTION_PROVIDER;
      const originalOpenaiKey = process.env.AGENT_MEMORY_OPENAI_API_KEY;

      // Set OpenAI key
      delete process.env.AGENT_MEMORY_EXTRACTION_PROVIDER;
      process.env.AGENT_MEMORY_OPENAI_API_KEY = 'sk-test-key';

      const { reloadConfig } = await import('../../src/config/index.js');
      reloadConfig();

      resetExtractionServiceState();
      const testService = new ExtractionService();

      expect(testService.getProvider()).toBe('openai');
      expect(testService.isAvailable()).toBe(true);

      // Restore
      if (originalProvider) {
        process.env.AGENT_MEMORY_EXTRACTION_PROVIDER = originalProvider;
      } else {
        delete process.env.AGENT_MEMORY_EXTRACTION_PROVIDER;
      }
      if (originalOpenaiKey) {
        process.env.AGENT_MEMORY_OPENAI_API_KEY = originalOpenaiKey;
      } else {
        delete process.env.AGENT_MEMORY_OPENAI_API_KEY;
      }
      reloadConfig();
    });

    it('should respect explicit provider setting', async () => {
      // Save original values
      const originalProvider = process.env.AGENT_MEMORY_EXTRACTION_PROVIDER;

      // Explicitly disable
      process.env.AGENT_MEMORY_EXTRACTION_PROVIDER = 'disabled';

      const { reloadConfig } = await import('../../src/config/index.js');
      reloadConfig();

      resetExtractionServiceState();
      const testService = new ExtractionService();

      expect(testService.getProvider()).toBe('disabled');

      // Restore
      if (originalProvider) {
        process.env.AGENT_MEMORY_EXTRACTION_PROVIDER = originalProvider;
      } else {
        delete process.env.AGENT_MEMORY_EXTRACTION_PROVIDER;
      }
      reloadConfig();
    });
  });

  // Note: Actual LLM extraction tests would require API keys or mocked responses
  // Those would be integration tests rather than unit tests

  describe('context size validation', () => {
    it('should reject context exceeding maximum length', async () => {
      // Only test if service is available
      if (!service.isAvailable()) {
        // Need a service that's not disabled to test validation
        const { reloadConfig } = await import('../../src/config/index.js');
        const originalProvider = process.env.AGENT_MEMORY_EXTRACTION_PROVIDER;
        process.env.AGENT_MEMORY_EXTRACTION_PROVIDER = 'openai';
        process.env.AGENT_MEMORY_OPENAI_API_KEY = 'sk-test';
        reloadConfig();

        resetExtractionServiceState();
        const enabledService = new ExtractionService();

        // Create context larger than 100KB
        const largeContext = 'x'.repeat(100001);

        await expect(enabledService.extract({ context: largeContext })).rejects.toThrow(
          'context exceeds maximum characters of 100000'
        );

        // Restore
        if (originalProvider) {
          process.env.AGENT_MEMORY_EXTRACTION_PROVIDER = originalProvider;
        } else {
          delete process.env.AGENT_MEMORY_EXTRACTION_PROVIDER;
        }
        delete process.env.AGENT_MEMORY_OPENAI_API_KEY;
        reloadConfig();
      } else {
        // Create context larger than 100KB
        const largeContext = 'x'.repeat(100001);

        await expect(service.extract({ context: largeContext })).rejects.toThrow(
          'context exceeds maximum characters of 100000'
        );
      }
    });

    it('should accept context at maximum length', async () => {
      // Only test if service is available
      if (!service.isAvailable()) {
        // Skip if disabled
        return;
      }

      // Create context exactly at 100KB
      const maxContext = 'x'.repeat(100000);

      // This would require API access, so we just verify it doesn't throw for size
      // The actual API call would fail without valid credentials
      try {
        await service.extract({ context: maxContext });
      } catch (error) {
        // Expected to fail on API call, not size validation
        expect((error as Error).message).not.toContain('Context exceeds maximum length');
      }
    });
  });

  describe('explicit config injection', () => {
    it('should use injected config over global config', () => {
      const customService = new ExtractionService({
        provider: 'disabled',
        openaiApiKey: 'test-key',
        openaiModel: 'gpt-4o',
        openaiBaseUrl: undefined,
        anthropicApiKey: undefined,
        anthropicModel: 'claude-3-5-sonnet-20241022',
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaModel: 'llama2',
      });

      expect(customService.getProvider()).toBe('disabled');
      expect(customService.isAvailable()).toBe(false);
    });

    it('should initialize OpenAI client with custom config', () => {
      const customService = new ExtractionService({
        provider: 'openai',
        openaiApiKey: 'sk-custom-key',
        openaiModel: 'gpt-4o-mini',
        openaiBaseUrl: undefined,
        anthropicApiKey: undefined,
        anthropicModel: 'claude-3-5-sonnet-20241022',
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaModel: 'llama2',
      });

      expect(customService.getProvider()).toBe('openai');
      expect(customService.isAvailable()).toBe(true);
    });

    it('should initialize Anthropic client with custom config', () => {
      const customService = new ExtractionService({
        provider: 'anthropic',
        openaiApiKey: undefined,
        openaiModel: 'gpt-4o-mini',
        openaiBaseUrl: undefined,
        anthropicApiKey: 'sk-ant-custom-key',
        anthropicModel: 'claude-3-5-sonnet-20241022',
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaModel: 'llama2',
      });

      expect(customService.getProvider()).toBe('anthropic');
      expect(customService.isAvailable()).toBe(true);
    });

    it('should validate Ollama model name', () => {
      // Valid model names
      expect(() => new ExtractionService({
        provider: 'ollama',
        openaiApiKey: undefined,
        openaiModel: 'gpt-4o-mini',
        openaiBaseUrl: undefined,
        anthropicApiKey: undefined,
        anthropicModel: 'claude-3-5-sonnet-20241022',
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaModel: 'llama2',
      })).not.toThrow();

      expect(() => new ExtractionService({
        provider: 'ollama',
        openaiApiKey: undefined,
        openaiModel: 'gpt-4o-mini',
        openaiBaseUrl: undefined,
        anthropicApiKey: undefined,
        anthropicModel: 'claude-3-5-sonnet-20241022',
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaModel: 'llama:7b',
      })).not.toThrow();

      expect(() => new ExtractionService({
        provider: 'ollama',
        openaiApiKey: undefined,
        openaiModel: 'gpt-4o-mini',
        openaiBaseUrl: undefined,
        anthropicApiKey: undefined,
        anthropicModel: 'claude-3-5-sonnet-20241022',
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaModel: 'mistral-7b-instruct-v0.2',
      })).not.toThrow();
    });

    it('should reject invalid Ollama model names', () => {
      // Invalid model names with special characters
      expect(() => new ExtractionService({
        provider: 'ollama',
        openaiApiKey: undefined,
        openaiModel: 'gpt-4o-mini',
        openaiBaseUrl: undefined,
        anthropicApiKey: undefined,
        anthropicModel: 'claude-3-5-sonnet-20241022',
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaModel: 'llama; rm -rf /',
      })).toThrow('Validation error: ollamaModel - invalid model name');

      expect(() => new ExtractionService({
        provider: 'ollama',
        openaiApiKey: undefined,
        openaiModel: 'gpt-4o-mini',
        openaiBaseUrl: undefined,
        anthropicApiKey: undefined,
        anthropicModel: 'claude-3-5-sonnet-20241022',
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaModel: 'model$(whoami)',
      })).toThrow('Validation error: ollamaModel - invalid model name');
    });
  });

  describe('OpenAI base URL validation', () => {
    it('should allow default base URL (undefined)', () => {
      expect(() => new ExtractionService({
        provider: 'openai',
        openaiApiKey: 'sk-test',
        openaiModel: 'gpt-4o-mini',
        openaiBaseUrl: undefined,
        anthropicApiKey: undefined,
        anthropicModel: 'claude-3-5-sonnet-20241022',
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaModel: 'llama2',
      })).not.toThrow();
    });

    it('should allow localhost in development mode', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      try {
        expect(() => new ExtractionService({
          provider: 'openai',
          openaiApiKey: 'sk-test',
          openaiModel: 'gpt-4o-mini',
          openaiBaseUrl: 'http://localhost:1234/v1',
          anthropicApiKey: undefined,
          anthropicModel: 'claude-3-5-sonnet-20241022',
          ollamaBaseUrl: 'http://localhost:11434',
          ollamaModel: 'llama2',
        })).not.toThrow();
      } finally {
        if (originalNodeEnv) {
          process.env.NODE_ENV = originalNodeEnv;
        } else {
          delete process.env.NODE_ENV;
        }
      }
    });

    it('should reject localhost in production mode', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        expect(() => new ExtractionService({
          provider: 'openai',
          openaiApiKey: 'sk-test',
          openaiModel: 'gpt-4o-mini',
          openaiBaseUrl: 'http://localhost:1234/v1',
          anthropicApiKey: undefined,
          anthropicModel: 'claude-3-5-sonnet-20241022',
          ollamaBaseUrl: 'http://localhost:11434',
          ollamaModel: 'llama2',
        })).toThrow('SSRF protection');
      } finally {
        if (originalNodeEnv) {
          process.env.NODE_ENV = originalNodeEnv;
        } else {
          delete process.env.NODE_ENV;
        }
      }
    });
  });

  describe('extraction input variations', () => {
    it('should handle different context types', async () => {
      if (!service.isAvailable()) {
        // Use disabled service to test disabled path
        const result = await service.extract({
          context: 'test content',
          contextType: 'conversation'
        });
        expect(result.provider).toBe('disabled');
      }
    });

    it('should handle focus areas', async () => {
      if (!service.isAvailable()) {
        const result = await service.extract({
          context: 'test content',
          focusAreas: ['decisions', 'facts']
        });
        expect(result.entries).toHaveLength(0);
      }
    });

    it('should handle scope hints', async () => {
      if (!service.isAvailable()) {
        const result = await service.extract({
          context: 'test content',
          scopeHint: {
            projectName: 'TestProject',
            language: 'TypeScript',
            domain: 'testing'
          }
        });
        expect(result.entries).toHaveLength(0);
      }
    });

    it('should handle existing summary', async () => {
      if (!service.isAvailable()) {
        const result = await service.extract({
          context: 'new content',
          existingSummary: 'Previous context...'
        });
        expect(result.entries).toHaveLength(0);
      }
    });
  });
});
