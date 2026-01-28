import { describe, it, expect } from 'vitest';

/**
 * Timestamp normalization tests
 *
 * Tests for proper Date parsing instead of fragile string manipulation.
 * Ensures timestamps with timezone offsets, milliseconds, and various formats
 * are correctly normalized for database comparisons.
 */

// Helper function to normalize timestamps (will be implemented in repositories)
// For testing purposes, we define the expected behavior here
const normalizeTimestamp = (ts: string | null | undefined): number => {
  if (!ts) {
    throw new Error('Timestamp is required');
  }
  const date = new Date(ts);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${ts}`);
  }
  return date.getTime();
};

describe('Timestamp Normalization', () => {
  describe('normalizeTimestamp', () => {
    it('should parse ISO 8601 timestamp with Z suffix', () => {
      const ts = '2025-01-28T21:00:00.000Z';
      const result = normalizeTimestamp(ts);

      expect(result).toBeDefined();
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);

      // Verify it's a valid millisecond timestamp
      const date = new Date(result);
      expect(date.getFullYear()).toBe(2025);
      expect(date.getMonth()).toBe(0); // January is 0
      expect(date.getDate()).toBe(28);
    });

    it('should parse timestamp with timezone offset (+05:30)', () => {
      const ts = '2025-01-28T21:00:00+05:30';
      const result = normalizeTimestamp(ts);

      expect(result).toBeDefined();
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);

      // Verify it's a valid timestamp
      const date = new Date(result);
      expect(date.getFullYear()).toBe(2025);
    });

    it('should parse timestamp with milliseconds', () => {
      const ts = '2025-01-28T21:00:00.123';
      const result = normalizeTimestamp(ts);

      expect(result).toBeDefined();
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);

      // Verify milliseconds are preserved
      const date = new Date(result);
      expect(date.getMilliseconds()).toBe(123);
    });

    it('should handle null timestamp gracefully', () => {
      expect(() => normalizeTimestamp(null)).toThrow('Timestamp is required');
    });

    it('should handle undefined timestamp gracefully', () => {
      expect(() => normalizeTimestamp(undefined)).toThrow('Timestamp is required');
    });

    it('should handle empty string timestamp gracefully', () => {
      expect(() => normalizeTimestamp('')).toThrow();
    });

    it('should throw on invalid timestamp format', () => {
      expect(() => normalizeTimestamp('not a date')).toThrow();
    });

    it('should throw on invalid date values', () => {
      expect(() => normalizeTimestamp('2025-13-45T25:00:00')).toThrow();
    });

    it('should compare timestamps numerically (not lexically)', () => {
      const ts1 = '2025-01-28T20:00:00Z';
      const ts2 = '2025-01-28T21:00:00Z';

      const result1 = normalizeTimestamp(ts1);
      const result2 = normalizeTimestamp(ts2);

      // Numeric comparison should work correctly
      expect(result1).toBeLessThan(result2);
      expect(result2 - result1).toBe(3600000); // 1 hour in milliseconds
    });

    it('should handle timestamps with negative timezone offset', () => {
      const ts = '2025-01-28T21:00:00-05:00';
      const result = normalizeTimestamp(ts);

      expect(result).toBeDefined();
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });

    it('should handle timestamps with Z and milliseconds', () => {
      const ts = '2025-01-28T21:00:00.999Z';
      const result = normalizeTimestamp(ts);

      expect(result).toBeDefined();
      const date = new Date(result);
      expect(date.getMilliseconds()).toBe(999);
    });

    it('should correctly normalize timestamps for BETWEEN comparisons', () => {
      const startTs = '2025-01-28T20:00:00Z';
      const midTs = '2025-01-28T21:00:00Z';
      const endTs = '2025-01-28T22:00:00Z';

      const startNorm = normalizeTimestamp(startTs);
      const midNorm = normalizeTimestamp(midTs);
      const endNorm = normalizeTimestamp(endTs);

      // Verify BETWEEN logic works
      expect(midNorm).toBeGreaterThanOrEqual(startNorm);
      expect(midNorm).toBeLessThanOrEqual(endNorm);
      expect(startNorm).toBeLessThan(midNorm);
      expect(midNorm).toBeLessThan(endNorm);
    });
  });
});
