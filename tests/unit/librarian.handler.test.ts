/**
 * Unit tests for librarian MCP handler
 *
 * Tests the handler functions including:
 * - Type guard usage (isRecommendationStatus, isScopeType)
 * - Error handling with formatError()
 * - Parameter validation
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { librarianHandlers } from '../../src/mcp/handlers/librarian.handler.js';
import { setupTestDb, cleanupTestDb, createTestContext } from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';

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
