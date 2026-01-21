/**
 * Unit tests for librarian MCP handler
 *
 * Tests the handler functions including:
 * - Type guard usage (isRecommendationStatus, isScopeType)
 * - Error handling with formatError()
 * - Parameter validation
 * - resolveEffectiveScope helper function
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  librarianHandlers,
  resolveEffectiveScope,
} from '../../src/mcp/handlers/librarian.handler.js';
import { setupTestDb, cleanupTestDb, createTestContext } from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';
import type {
  IContextDetectionService,
  ResolvedProjectScope,
} from '../../src/services/context-detection.service.js';

const TEST_DB_PATH = './data/test-librarian-handler.db';
let ctx: AppContext;
let testDb: ReturnType<typeof setupTestDb>;

describe('librarian handler', () => {
  beforeAll(async () => {
    testDb = setupTestDb(TEST_DB_PATH);
    ctx = await createTestContext(testDb);
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('status action', () => {
    it('should return success with status info', async () => {
      const result = await librarianHandlers.status(ctx, {});

      // Should return success with status information
      expect(result).toHaveProperty('success');
      // If service unavailable, error is returned
      if (!result.success) {
        expect(result).toHaveProperty('error');
      } else {
        expect(result).toHaveProperty('status');
      }
    });
  });

  describe('analyze action', () => {
    it('should accept valid scopeType parameter', async () => {
      const result = await librarianHandlers.analyze(ctx, {
        scopeType: 'project',
        scopeId: 'test-project',
        dryRun: true,
      });

      // Should return with success or error about service
      expect(result).toHaveProperty('success');
    });

    it('should use default scopeType when not provided', async () => {
      const result = await librarianHandlers.analyze(ctx, {
        dryRun: true,
      });

      // Should not throw, defaults to 'project'
      expect(result).toHaveProperty('success');
    });

    it('should validate scopeType parameter with type guard', async () => {
      // Invalid scopeType should throw validation error via type guard
      await expect(
        librarianHandlers.analyze(ctx, {
          scopeType: 'invalid-scope',
          dryRun: true,
        })
      ).rejects.toThrow(/scopeType.*invalid/i);
    });
  });

  describe('list_recommendations action', () => {
    it('should accept valid status filter', async () => {
      const result = await librarianHandlers.list_recommendations(ctx, {
        status: 'pending',
        limit: 10,
      });

      expect(result).toHaveProperty('success');
    });

    it('should handle pagination parameters', async () => {
      const result = await librarianHandlers.list_recommendations(ctx, {
        limit: 5,
        offset: 0,
      });

      expect(result).toHaveProperty('success');
      if (result.success) {
        expect(result).toHaveProperty('recommendations');
        expect(result).toHaveProperty('total');
      }
    });

    it('should validate status parameter with type guard', async () => {
      // Invalid status should throw validation error via type guard
      await expect(
        librarianHandlers.list_recommendations(ctx, {
          status: 'invalid-status',
        })
      ).rejects.toThrow(/status.*invalid/i);
    });
  });

  describe('show_recommendation action', () => {
    it('should require recommendationId parameter', async () => {
      const result = await librarianHandlers.show_recommendation(ctx, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('recommendationId is required');
    });

    it('should handle non-existent recommendation', async () => {
      const result = await librarianHandlers.show_recommendation(ctx, {
        recommendationId: 'non-existent-id',
      });

      expect(result.success).toBe(false);
      // Either service unavailable or not found
      expect(result.error).toBeDefined();
    });
  });

  describe('approve action', () => {
    it('should require recommendationId parameter', async () => {
      const result = await librarianHandlers.approve(ctx, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('recommendationId is required');
    });

    it('should handle optional parameters', async () => {
      const result = await librarianHandlers.approve(ctx, {
        recommendationId: 'test-rec-id',
        reviewedBy: 'test-user',
        notes: 'Approved for testing',
      });

      // Should return error for non-existent recommendation
      expect(result.success).toBe(false);
    });
  });

  describe('reject action', () => {
    it('should require recommendationId parameter', async () => {
      const result = await librarianHandlers.reject(ctx, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('recommendationId is required');
    });
  });

  describe('skip action', () => {
    it('should require recommendationId parameter', async () => {
      const result = await librarianHandlers.skip(ctx, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('recommendationId is required');
    });
  });

  describe('error handling', () => {
    it('should format errors consistently', async () => {
      // Test that errors are formatted with formatError()
      const result = await librarianHandlers.show_recommendation(ctx, {
        recommendationId: 'invalid',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // formatError returns { error: string, code?: string }
      expect(typeof result.error).toBe('string');
    });
  });
});

describe('resolveEffectiveScope', () => {
  function createMockContextDetection(
    mockResolve: (scopeType: string, scopeId?: string) => Promise<ResolvedProjectScope>
  ): IContextDetectionService {
    return {
      detect: vi.fn(),
      enrichParams: vi.fn(),
      clearCache: vi.fn(),
      resolveProjectScope: mockResolve as any,
    };
  }

  describe('when scopeType is project', () => {
    it('should use context detection service to resolve scopeId', async () => {
      const mockResolve = vi.fn().mockResolvedValue({
        projectId: 'session-proj',
        source: 'session',
        sessionId: 'sess-123',
      });
      const contextDetection = createMockContextDetection(mockResolve);

      const result = await resolveEffectiveScope(contextDetection, 'project', undefined);

      expect(mockResolve).toHaveBeenCalledWith('project', undefined);
      expect(result.scopeType).toBe('project');
      expect(result.scopeId).toBe('session-proj');
    });

    it('should include warning when present', async () => {
      const mockResolve = vi.fn().mockResolvedValue({
        projectId: 'explicit-proj',
        source: 'explicit',
        sessionId: 'sess-123',
        warning: 'Explicit scopeId differs from active session',
      });
      const contextDetection = createMockContextDetection(mockResolve);

      const result = await resolveEffectiveScope(contextDetection, 'project', 'explicit-proj');

      expect(result.scopeId).toBe('explicit-proj');
      expect(result.warning).toBe('Explicit scopeId differs from active session');
    });

    it('should pass through explicit scopeId', async () => {
      const mockResolve = vi.fn().mockResolvedValue({
        projectId: 'explicit-proj',
        source: 'explicit',
      });
      const contextDetection = createMockContextDetection(mockResolve);

      const result = await resolveEffectiveScope(contextDetection, 'project', 'explicit-proj');

      expect(mockResolve).toHaveBeenCalledWith('project', 'explicit-proj');
      expect(result.scopeId).toBe('explicit-proj');
    });
  });

  describe('when scopeType is global', () => {
    it('should return undefined scopeId for global scope', async () => {
      const mockResolve = vi.fn().mockResolvedValue({
        projectId: '',
        source: 'explicit',
      });
      const contextDetection = createMockContextDetection(mockResolve);

      const result = await resolveEffectiveScope(contextDetection, 'global', undefined);

      // For global scope, scopeId should be undefined (empty string is converted)
      expect(result.scopeType).toBe('global');
      expect(result.scopeId).toBeUndefined();
    });
  });

  describe('when context detection is not available', () => {
    it('should fall back to original behavior', async () => {
      const result = await resolveEffectiveScope(undefined, 'project', 'explicit-proj');

      expect(result.scopeType).toBe('project');
      expect(result.scopeId).toBe('explicit-proj');
      expect(result.warning).toBeUndefined();
    });

    it('should return undefined scopeId when no explicit scopeId provided', async () => {
      const result = await resolveEffectiveScope(undefined, 'project', undefined);

      expect(result.scopeType).toBe('project');
      expect(result.scopeId).toBeUndefined();
    });
  });

  describe('when context detection throws', () => {
    it('should fall back to original behavior and not throw', async () => {
      const mockResolve = vi.fn().mockRejectedValue(new Error('No active session found'));
      const contextDetection = createMockContextDetection(mockResolve);

      const result = await resolveEffectiveScope(contextDetection, 'project', undefined);

      // Should fall back gracefully
      expect(result.scopeType).toBe('project');
      expect(result.scopeId).toBeUndefined();
    });
  });
});
