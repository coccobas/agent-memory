/**
 * Unit tests for memory_ops handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { opsHandlers } from '../../src/mcp/handlers/ops.handler.js';
import type { AppContext } from '../../src/core/context.js';

// Mock context factory
function createMockContext(overrides: Partial<AppContext> = {}): AppContext {
  return {
    config: {
      autoContext: {
        enabled: true,
        sessionTimeoutEnabled: true,
        sessionInactivityMs: 30 * 60 * 1000,
        sessionTimeoutCheckMs: 5 * 60 * 1000,
        defaultAgentId: 'test-agent',
        cacheTTLMs: 60000,
      },
      autoTagging: {
        enabled: true,
        maxTags: 3,
        minConfidence: 0.6,
        skipIfUserProvided: true,
      },
    } as AppContext['config'],
    services: {
      autoTagging: {
        inferTags: vi.fn().mockReturnValue([
          { name: 'typescript', confidence: 0.9, source: 'keyword' },
          { name: 'testing', confidence: 0.8, source: 'keyword' },
        ]),
        applyTags: vi.fn().mockResolvedValue({
          tags: ['typescript', 'testing'],
          suggestions: [
            { name: 'typescript', confidence: 0.9, source: 'keyword' },
            { name: 'testing', confidence: 0.8, source: 'keyword' },
          ],
          skipped: false,
        }),
      },
      sessionTimeout: {
        getLastActivity: vi.fn().mockReturnValue(Date.now() - 5000),
        checkAndEndStaleSessions: vi.fn().mockResolvedValue(0),
        recordActivity: vi.fn(),
      },
      redFlag: {
        detectRedFlags: vi.fn().mockResolvedValue([
          { pattern: 'malformed_json', severity: 'high', description: 'Potentially malformed JSON' },
        ]),
        scoreRedFlagRisk: vi.fn().mockResolvedValue(0.4),
      },
    } as unknown as AppContext['services'],
    repos: {
      guidelines: {
        getById: vi.fn().mockResolvedValue({
          currentVersion: { content: 'Test guideline content' },
        }),
      },
      knowledge: {
        getById: vi.fn().mockResolvedValue({
          currentVersion: { content: 'Test knowledge content' },
        }),
      },
      tools: {
        getById: vi.fn().mockResolvedValue({
          currentVersion: { description: 'Test tool description' },
        }),
      },
    } as unknown as AppContext['repos'],
    db: {} as AppContext['db'],
    sqlite: {
      prepare: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue({ total: 100, with_emb: 85 }),
      }),
    } as unknown as AppContext['sqlite'],
    ...overrides,
  } as AppContext;
}

describe('opsHandlers', () => {
  describe('auto_tag', () => {
    it('should infer tags from content', async () => {
      const context = createMockContext();
      const result = await opsHandlers.auto_tag(context, {
        content: 'This is a TypeScript test with vitest',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('auto_tag');
      expect(result.mode).toBe('infer');
      expect(result.suggestions).toHaveLength(2);
      expect(context.services.autoTagging?.inferTags).toHaveBeenCalledWith(
        'This is a TypeScript test with vitest',
        undefined
      );
    });

    it('should apply tags to an entry', async () => {
      const context = createMockContext();
      const result = await opsHandlers.auto_tag(context, {
        entryType: 'guideline',
        entryId: 'guid-123',
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('apply');
      expect(result.tags).toEqual(['typescript', 'testing']);
    });

    it('should return error if no content or entry specified', async () => {
      const context = createMockContext();
      const result = await opsHandlers.auto_tag(context, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Provide either content');
    });

    it('should return error if auto-tagging service unavailable', async () => {
      const context = createMockContext({
        services: { autoTagging: undefined } as unknown as AppContext['services'],
      });
      const result = await opsHandlers.auto_tag(context, {
        content: 'test content',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });
  });

  describe('session_timeout', () => {
    it('should return status with config and session info', async () => {
      const context = createMockContext();
      const result = await opsHandlers.session_timeout(context, {
        subAction: 'status',
        sessionId: 'sess-123',
      });

      expect(result.success).toBe(true);
      expect(result.subAction).toBe('status');
      expect(result.config).toBeDefined();
      expect(result.config.enabled).toBe(true);
      expect(result.sessionInfo).toBeDefined();
      expect(result.sessionInfo.sessionId).toBe('sess-123');
    });

    it('should check and end stale sessions', async () => {
      const context = createMockContext();
      const result = await opsHandlers.session_timeout(context, {
        subAction: 'check',
      });

      expect(result.success).toBe(true);
      expect(result.subAction).toBe('check');
      expect(result.sessionsEnded).toBe(0);
      expect(context.services.sessionTimeout?.checkAndEndStaleSessions).toHaveBeenCalled();
    });

    it('should record activity for a session', async () => {
      const context = createMockContext();
      const result = await opsHandlers.session_timeout(context, {
        subAction: 'record_activity',
        sessionId: 'sess-123',
      });

      expect(result.success).toBe(true);
      expect(result.subAction).toBe('record_activity');
      expect(context.services.sessionTimeout?.recordActivity).toHaveBeenCalledWith('sess-123');
    });

    it('should return error for unknown subAction', async () => {
      const context = createMockContext();
      const result = await opsHandlers.session_timeout(context, {
        subAction: 'unknown',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown subAction');
    });
  });

  describe('red_flags', () => {
    it('should detect red flags in content', async () => {
      const context = createMockContext();
      const result = await opsHandlers.red_flags(context, {
        content: '{"invalid json',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('red_flags');
      expect(result.mode).toBe('detect');
      expect(result.flagCount).toBe(1);
      expect(result.highSeverity).toBe(1);
    });

    it('should score red flag risk for an entry', async () => {
      const context = createMockContext();
      const result = await opsHandlers.red_flags(context, {
        entryType: 'knowledge',
        entryId: 'know-123',
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('score');
      expect(result.riskScore).toBe(0.4);
      expect(result.riskLevel).toBe('medium');
    });

    it('should return error if no content or entry specified', async () => {
      const context = createMockContext();
      const result = await opsHandlers.red_flags(context, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Provide either content');
    });
  });

  describe('embedding_coverage', () => {
    it('should return coverage metrics', async () => {
      const context = createMockContext();
      const result = await opsHandlers.embedding_coverage(context, {
        scopeType: 'project',
        scopeId: 'proj-123',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('embedding_coverage');
      expect(result.coverage).toBeDefined();
      expect(result.healthStatus).toBeDefined();
    });

    it('should return error if sqlite not available', async () => {
      const context = createMockContext({ sqlite: undefined });
      const result = await opsHandlers.embedding_coverage(context, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('SQLite database not available');
    });
  });

  describe('backfill_status', () => {
    it('should return backfill statistics', () => {
      // Create a mock db with select method
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              get: vi.fn().mockReturnValue({ count: 10 }),
            }),
          }),
        }),
      };

      const context = createMockContext({
        db: mockDb as unknown as AppContext['db'],
      });

      // The handler calls getBackfillStats which queries the DB directly
      const result = opsHandlers.backfill_status(context, {});

      expect(result.success).toBe(true);
      expect(result.action).toBe('backfill_status');
      expect(result.stats).toBeDefined();
      expect(result.summary).toBeDefined();
    });
  });

  describe('trigger_config', () => {
    it('should get current trigger config', () => {
      const context = createMockContext();
      const result = opsHandlers.trigger_config(context, {
        subAction: 'get',
      });

      expect(result.success).toBe(true);
      expect(result.subAction).toBe('get');
      expect(result.config).toBeDefined();
      expect(result.config.enabled).toBeDefined();
    });

    it('should update trigger config', () => {
      const context = createMockContext();
      const result = opsHandlers.trigger_config(context, {
        subAction: 'update',
        updates: { cooldownMs: 60000 },
      });

      expect(result.success).toBe(true);
      expect(result.subAction).toBe('update');
      expect(result.config.cooldownMs).toBe(60000);
    });

    it('should reset trigger config to defaults', () => {
      const context = createMockContext();

      // First update to non-default
      opsHandlers.trigger_config(context, {
        subAction: 'update',
        updates: { cooldownMs: 99999 },
      });

      // Then reset
      const result = opsHandlers.trigger_config(context, {
        subAction: 'reset',
      });

      expect(result.success).toBe(true);
      expect(result.subAction).toBe('reset');
      expect(result.config.cooldownMs).toBe(30000); // Default value
    });

    it('should return error if update without updates object', () => {
      const context = createMockContext();
      const result = opsHandlers.trigger_config(context, {
        subAction: 'update',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('updates object is required');
    });
  });
});
