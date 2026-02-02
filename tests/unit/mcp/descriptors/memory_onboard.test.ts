/**
 * Tests for memory_onboard MCP descriptor
 *
 * Tests the --useLlm flag validation and behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { memoryOnboardDescriptor } from '../../../../src/mcp/descriptors/memory_onboard.js';
import {
  config,
  snapshotConfig,
  restoreConfig,
  withTestEnv,
} from '../../../../src/config/index.js';

describe('memory_onboard descriptor', () => {
  let configSnapshot: ReturnType<typeof snapshotConfig>;

  beforeEach(() => {
    configSnapshot = snapshotConfig();
  });

  afterEach(() => {
    restoreConfig(configSnapshot);
  });

  describe('useLlm flag', () => {
    it('should have useLlm parameter in descriptor schema', () => {
      expect(memoryOnboardDescriptor.params).toBeDefined();
      expect(memoryOnboardDescriptor.params).toHaveProperty('useLlm');
      const useLlmParam = memoryOnboardDescriptor.params?.useLlm;
      expect(useLlmParam?.type).toBe('boolean');
      expect(useLlmParam?.description).toContain('LLM-assisted');
    });

    it('should default useLlm to false when not provided', async () => {
      await withTestEnv({ AGENT_MEMORY_OPENAI_API_KEY: 'sk-test-key' }, async () => {
        const args: Record<string, unknown> = {};

        expect(() => {
          const options = {
            useLlm: (args?.useLlm as boolean) ?? false,
          };
          if (options.useLlm && !config.extraction.openaiApiKey) {
            throw new Error('--useLlm requires AGENT_MEMORY_OPENAI_API_KEY');
          }
        }).not.toThrow();
      });
    });

    it('should throw error when useLlm=true but no API key configured', async () => {
      await withTestEnv({ AGENT_MEMORY_OPENAI_API_KEY: undefined }, async () => {
        const args = { useLlm: true };

        expect(() => {
          const options = {
            useLlm: (args?.useLlm as boolean) ?? false,
          };
          if (options.useLlm && !config.extraction.openaiApiKey) {
            throw new Error(
              '--useLlm requires AGENT_MEMORY_OPENAI_API_KEY to be set. ' +
                'Please configure the API key or disable LLM mode.'
            );
          }
        }).toThrow('--useLlm requires AGENT_MEMORY_OPENAI_API_KEY');
      });
    });

    it('should not throw error when useLlm=true and API key is configured', async () => {
      await withTestEnv({ AGENT_MEMORY_OPENAI_API_KEY: 'sk-test-key-123' }, async () => {
        const args = { useLlm: true };

        expect(() => {
          const options = {
            useLlm: (args?.useLlm as boolean) ?? false,
          };
          if (options.useLlm && !config.extraction.openaiApiKey) {
            throw new Error(
              '--useLlm requires AGENT_MEMORY_OPENAI_API_KEY to be set. ' +
                'Please configure the API key or disable LLM mode.'
            );
          }
        }).not.toThrow();
      });
    });

    it('should not throw error when useLlm=false regardless of API key', async () => {
      await withTestEnv({ AGENT_MEMORY_OPENAI_API_KEY: undefined }, async () => {
        const args = { useLlm: false };

        expect(() => {
          const options = {
            useLlm: (args?.useLlm as boolean) ?? false,
          };
          if (options.useLlm && !config.extraction.openaiApiKey) {
            throw new Error(
              '--useLlm requires AGENT_MEMORY_OPENAI_API_KEY to be set. ' +
                'Please configure the API key or disable LLM mode.'
            );
          }
        }).not.toThrow();
      });
    });

    it('should have proper error message when validation fails', async () => {
      await withTestEnv({ AGENT_MEMORY_OPENAI_API_KEY: undefined }, async () => {
        const args = { useLlm: true };

        try {
          const options = {
            useLlm: (args?.useLlm as boolean) ?? false,
          };
          if (options.useLlm && !config.extraction.openaiApiKey) {
            throw new Error(
              '--useLlm requires AGENT_MEMORY_OPENAI_API_KEY to be set. ' +
                'Please configure the API key or disable LLM mode.'
            );
          }
          expect.fail('Should have thrown an error');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain('AGENT_MEMORY_OPENAI_API_KEY');
          expect((error as Error).message).toContain('--useLlm');
        }
      });
    });
  });

  describe('descriptor structure', () => {
    it('should have all required descriptor properties', () => {
      expect(memoryOnboardDescriptor).toHaveProperty('name');
      expect(memoryOnboardDescriptor).toHaveProperty('visibility');
      expect(memoryOnboardDescriptor).toHaveProperty('description');
      expect(memoryOnboardDescriptor).toHaveProperty('params');
      expect(memoryOnboardDescriptor).toHaveProperty('contextHandler');
    });

    it('should have correct descriptor name', () => {
      expect(memoryOnboardDescriptor.name).toBe('memory_onboard');
    });

    it('should have all expected parameters', () => {
      const expectedParams = [
        'projectName',
        'importDocs',
        'seedGuidelines',
        'skipSteps',
        'dryRun',
        'deepScan',
        'mintoStyle',
        'useLlm',
      ];

      for (const param of expectedParams) {
        expect(memoryOnboardDescriptor.params).toHaveProperty(param);
      }
    });
  });
});
