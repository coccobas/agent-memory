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
        'Cannot extract from empty context'
      );
      await expect(service.extract({ context: '   ' })).rejects.toThrow(
        'Cannot extract from empty context'
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
    it('should default to disabled when no API keys provided', async () => {
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

      expect(testService.getProvider()).toBe('disabled');

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
});
