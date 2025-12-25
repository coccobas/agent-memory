/**
 * Unit tests for base repository utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateId,
  now,
  encodeCursor,
  decodeCursor,
  createPaginatedResult,
  registerVectorCleanupHook,
  asyncVectorCleanup,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  CONFLICT_WINDOW_MS,
  DEFAULT_LOCK_TIMEOUT_SECONDS,
  MAX_LOCK_TIMEOUT_SECONDS,
} from '../../src/db/repositories/base.js';

describe('Base Repository Utilities', () => {
  describe('generateId', () => {
    it('should generate a valid UUID', () => {
      const id = generateId();

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      // UUID v4 format check
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('now', () => {
    it('should return ISO timestamp', () => {
      const timestamp = now();

      expect(typeof timestamp).toBe('string');
      // ISO format check
      expect(() => new Date(timestamp)).not.toThrow();
    });

    it('should return current time', () => {
      const before = Date.now();
      const timestamp = now();
      const after = Date.now();

      const time = new Date(timestamp).getTime();
      expect(time).toBeGreaterThanOrEqual(before);
      expect(time).toBeLessThanOrEqual(after);
    });
  });

  describe('encodeCursor', () => {
    it('should encode offset to base64', () => {
      const cursor = encodeCursor(10);

      expect(typeof cursor).toBe('string');
      // Should be valid base64
      expect(() => Buffer.from(cursor, 'base64')).not.toThrow();
    });

    it('should encode different offsets differently', () => {
      const cursor1 = encodeCursor(0);
      const cursor2 = encodeCursor(10);
      const cursor3 = encodeCursor(100);

      expect(cursor1).not.toBe(cursor2);
      expect(cursor2).not.toBe(cursor3);
    });

    it('should encode zero offset', () => {
      const cursor = encodeCursor(0);
      expect(cursor).toBeDefined();
    });
  });

  describe('decodeCursor', () => {
    it('should decode valid cursor', () => {
      const cursor = encodeCursor(25);
      const decoded = decodeCursor(cursor);

      expect(decoded).not.toBeNull();
      expect(decoded?.offset).toBe(25);
    });

    it('should return null for invalid base64', () => {
      const result = decodeCursor('not-valid-base64!!!');
      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      const invalidJson = Buffer.from('not json').toString('base64');
      const result = decodeCursor(invalidJson);
      expect(result).toBeNull();
    });

    it('should return null for missing offset', () => {
      const noOffset = Buffer.from('{}').toString('base64');
      const result = decodeCursor(noOffset);
      expect(result).toBeNull();
    });

    it('should return null for negative offset', () => {
      const negative = Buffer.from('{"offset":-1}').toString('base64');
      const result = decodeCursor(negative);
      expect(result).toBeNull();
    });

    it('should return null for non-numeric offset', () => {
      const nonNumeric = Buffer.from('{"offset":"10"}').toString('base64');
      const result = decodeCursor(nonNumeric);
      expect(result).toBeNull();
    });

    it('should handle empty string', () => {
      const result = decodeCursor('');
      expect(result).toBeNull();
    });
  });

  describe('encodeCursor and decodeCursor round-trip', () => {
    it('should round-trip correctly', () => {
      const offsets = [0, 1, 10, 100, 1000, 99999];

      for (const offset of offsets) {
        const cursor = encodeCursor(offset);
        const decoded = decodeCursor(cursor);

        expect(decoded?.offset).toBe(offset);
      }
    });
  });

  describe('createPaginatedResult', () => {
    it('should return all items when under limit', () => {
      const items = [1, 2, 3, 4, 5];
      const result = createPaginatedResult(items, 10, 0);

      expect(result.items).toEqual(items);
      expect(result.meta.returnedCount).toBe(5);
      expect(result.meta.hasMore).toBe(false);
      expect(result.meta.truncated).toBe(false);
      expect(result.meta.nextCursor).toBeUndefined();
    });

    it('should truncate when at limit+1', () => {
      const items = [1, 2, 3, 4, 5, 6];
      const result = createPaginatedResult(items, 5, 0);

      expect(result.items).toEqual([1, 2, 3, 4, 5]);
      expect(result.meta.returnedCount).toBe(5);
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.truncated).toBe(true);
      expect(result.meta.nextCursor).toBeDefined();
    });

    it('should provide next cursor with correct offset', () => {
      const items = [1, 2, 3, 4, 5, 6];
      const result = createPaginatedResult(items, 5, 10);

      const decoded = decodeCursor(result.meta.nextCursor!);
      expect(decoded?.offset).toBe(15); // 10 + 5
    });

    it('should handle empty items', () => {
      const result = createPaginatedResult([], 10, 0);

      expect(result.items).toEqual([]);
      expect(result.meta.returnedCount).toBe(0);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should set totalCount to -1', () => {
      const result = createPaginatedResult([1], 10, 0);
      expect(result.meta.totalCount).toBe(-1);
    });
  });

  describe('registerVectorCleanupHook and asyncVectorCleanup', () => {
    beforeEach(() => {
      // Reset the hook before each test
      registerVectorCleanupHook(null);
    });

    afterEach(() => {
      // Clean up after tests
      registerVectorCleanupHook(null);
    });

    it('should not throw when no hook registered', () => {
      expect(() => asyncVectorCleanup('tool', 'test-id')).not.toThrow();
    });

    it('should call registered hook', async () => {
      const hook = vi.fn().mockResolvedValue(undefined);
      registerVectorCleanupHook(hook);

      asyncVectorCleanup('tool', 'test-id');

      // Wait for async execution
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(hook).toHaveBeenCalledWith('tool', 'test-id');
    });

    it('should handle hook errors gracefully', async () => {
      const hook = vi.fn().mockRejectedValue(new Error('Cleanup failed'));
      registerVectorCleanupHook(hook);

      // Should not throw
      expect(() => asyncVectorCleanup('guideline', 'test-id')).not.toThrow();

      // Wait for async execution
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(hook).toHaveBeenCalledWith('guideline', 'test-id');
    });

    it('should allow unregistering hook', async () => {
      const hook = vi.fn().mockResolvedValue(undefined);
      registerVectorCleanupHook(hook);
      registerVectorCleanupHook(null);

      asyncVectorCleanup('knowledge', 'test-id');

      // Wait for potential async execution
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(hook).not.toHaveBeenCalled();
    });

    it('should replace previous hook', async () => {
      const hook1 = vi.fn().mockResolvedValue(undefined);
      const hook2 = vi.fn().mockResolvedValue(undefined);

      registerVectorCleanupHook(hook1);
      registerVectorCleanupHook(hook2);

      asyncVectorCleanup('tool', 'test-id');

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(hook1).not.toHaveBeenCalled();
      expect(hook2).toHaveBeenCalledWith('tool', 'test-id');
    });
  });

  describe('Constants', () => {
    it('should have correct DEFAULT_LIMIT', () => {
      expect(DEFAULT_LIMIT).toBe(20);
    });

    it('should have correct MAX_LIMIT', () => {
      expect(MAX_LIMIT).toBe(100);
    });

    it('should have correct CONFLICT_WINDOW_MS', () => {
      expect(CONFLICT_WINDOW_MS).toBe(5000);
    });

    it('should have correct DEFAULT_LOCK_TIMEOUT_SECONDS', () => {
      expect(DEFAULT_LOCK_TIMEOUT_SECONDS).toBe(3600);
    });

    it('should have correct MAX_LOCK_TIMEOUT_SECONDS', () => {
      expect(MAX_LOCK_TIMEOUT_SECONDS).toBe(86400);
    });
  });
});
