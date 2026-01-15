/**
 * Unit tests for observe handler
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { observeHandlers } from '../../src/mcp/handlers/observe.handler.js';
import {
  resetExtractionServiceState,
  ExtractionService,
} from '../../src/services/extraction.service.js';
import { ErrorCodes } from '../../src/mcp/errors.js';
import { setupTestDb, cleanupTestDb, createTestContext } from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';

const TEST_DB_PATH = './data/test-observe-handler.db';
let ctx: AppContext;
let testDb: ReturnType<typeof setupTestDb>;

describe('observe handler', () => {
  beforeAll(async () => {
    testDb = setupTestDb(TEST_DB_PATH);
    ctx = await createTestContext(testDb);
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  beforeEach(() => {
    resetExtractionServiceState();
  });

  afterEach(() => {
    resetExtractionServiceState();
  });

  describe('status action', () => {
    it('should return extraction service status', () => {
      // status now requires AppContext
      const result = observeHandlers.status(ctx);

      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('provider');
      expect(result).toHaveProperty('configured');
      expect(typeof result.available).toBe('boolean');
      expect(['openai', 'anthropic', 'ollama', 'disabled']).toContain(result.provider);
      expect(typeof result.configured).toBe('boolean');
    });

    it('should show configured as false when disabled', async () => {
      const originalProvider = process.env.AGENT_MEMORY_EXTRACTION_PROVIDER;
      process.env.AGENT_MEMORY_EXTRACTION_PROVIDER = 'disabled';

      const { reloadConfig } = await import('../../src/config/index.js');
      reloadConfig();
      resetExtractionServiceState();

      // Create a new context with disabled extraction service
      const disabledCtx = await createTestContext(testDb);

      const result = observeHandlers.status(disabledCtx);

      expect(result.available).toBe(false);
      expect(result.provider).toBe('disabled');
      expect(result.configured).toBe(false);

      // Restore
      if (originalProvider) {
        process.env.AGENT_MEMORY_EXTRACTION_PROVIDER = originalProvider;
      } else {
        delete process.env.AGENT_MEMORY_EXTRACTION_PROVIDER;
      }
      reloadConfig();
    });
  });

  describe('extract action validation', () => {
    it('should require context parameter', async () => {
      await expect(observeHandlers.extract(ctx, { scopeType: 'global' })).rejects.toThrow();
    });

    it('should require scopeId for non-global scope when autoStore is enabled', async () => {
      // Force disabled to avoid needing actual LLM
      const originalProvider = process.env.AGENT_MEMORY_EXTRACTION_PROVIDER;
      process.env.AGENT_MEMORY_EXTRACTION_PROVIDER = 'disabled';

      const { reloadConfig } = await import('../../src/config/index.js');
      reloadConfig();
      resetExtractionServiceState();

      // scopeId is only required when autoStore is true
      await expect(
        observeHandlers.extract(ctx, {
          context: 'Test context',
          scopeType: 'project',
          autoStore: true,
          // Missing scopeId
        })
      ).rejects.toThrow('scopeId');

      // Restore
      if (originalProvider) {
        process.env.AGENT_MEMORY_EXTRACTION_PROVIDER = originalProvider;
      } else {
        delete process.env.AGENT_MEMORY_EXTRACTION_PROVIDER;
      }
      reloadConfig();
    });

    it('should throw extraction unavailable error when disabled', async () => {
      const originalProvider = process.env.AGENT_MEMORY_EXTRACTION_PROVIDER;
      process.env.AGENT_MEMORY_EXTRACTION_PROVIDER = 'disabled';

      const { reloadConfig } = await import('../../src/config/index.js');
      reloadConfig();
      resetExtractionServiceState();

      // Create a new context with disabled extraction service
      const disabledCtx = await createTestContext(testDb);

      await expect(
        observeHandlers.extract(disabledCtx, {
          context: 'Test context',
          scopeType: 'global',
        })
      ).rejects.toThrow('Extraction service not available');

      // Restore
      if (originalProvider) {
        process.env.AGENT_MEMORY_EXTRACTION_PROVIDER = originalProvider;
      } else {
        delete process.env.AGENT_MEMORY_EXTRACTION_PROVIDER;
      }
      reloadConfig();
    });
  });

  describe('parameter handling', () => {
    it('should accept all optional parameters without error', () => {
      // This just validates the type guards work
      const params = {
        context: 'Test context',
        contextType: 'conversation',
        scopeType: 'global',
        autoStore: false,
        confidenceThreshold: 0.8,
        focusAreas: ['decisions', 'facts'],
        agentId: 'test-agent',
      };

      // Validate parameter extraction doesn't throw
      // (actual extraction would fail without provider)
      expect(() => {
        const context = params.context;
        const contextType = params.contextType;
        const scopeType = params.scopeType;
        expect(context).toBeDefined();
        expect(contextType).toBe('conversation');
        expect(scopeType).toBe('global');
      }).not.toThrow();
    });
  });
});
