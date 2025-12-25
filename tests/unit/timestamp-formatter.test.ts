import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatTimestamp, formatTimestamps } from '../../src/utils/timestamp-formatter.js';

// Mock the config
vi.mock('../../src/config/index.js', () => ({
  config: {
    timestamps: {
      displayTimezone: 'local',
    },
  },
}));

describe('timestamp-formatter', () => {
  describe('formatTimestamp', () => {
    it('should return null for null input', () => {
      expect(formatTimestamp(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(formatTimestamp(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(formatTimestamp('')).toBeNull();
    });

    it('should format valid ISO timestamp', () => {
      const result = formatTimestamp('2025-12-17T11:49:12.000Z');
      expect(result).toBeTruthy();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should return original string for invalid date', () => {
      const invalidDate = 'not-a-date';
      expect(formatTimestamp(invalidDate)).toBe(invalidDate);
    });

    it('should handle date-only strings', () => {
      const result = formatTimestamp('2025-12-17');
      expect(result).toBeTruthy();
      expect(result).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('should handle timestamps without milliseconds', () => {
      const result = formatTimestamp('2025-12-17T11:49:12Z');
      expect(result).toBeTruthy();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should handle timestamps with timezone offset', () => {
      const result = formatTimestamp('2025-12-17T11:49:12+05:00');
      expect(result).toBeTruthy();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
  });

  describe('formatTimestamps', () => {
    it('should return null for null input', () => {
      expect(formatTimestamps(null)).toBeNull();
    });

    it('should return undefined for undefined input', () => {
      expect(formatTimestamps(undefined)).toBeUndefined();
    });

    it('should return primitive values unchanged', () => {
      expect(formatTimestamps('string')).toBe('string');
      expect(formatTimestamps(123)).toBe(123);
      expect(formatTimestamps(true)).toBe(true);
    });

    it('should format createdAt field', () => {
      const obj = { createdAt: '2025-12-17T11:49:12.000Z' };
      const result = formatTimestamps(obj);
      expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should format updatedAt field', () => {
      const obj = { updatedAt: '2025-12-17T11:49:12.000Z' };
      const result = formatTimestamps(obj);
      expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should format startedAt field', () => {
      const obj = { startedAt: '2025-12-17T11:49:12.000Z' };
      const result = formatTimestamps(obj);
      expect(result.startedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should format endedAt field', () => {
      const obj = { endedAt: '2025-12-17T11:49:12.000Z' };
      const result = formatTimestamps(obj);
      expect(result.endedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should format checkedOutAt field', () => {
      const obj = { checkedOutAt: '2025-12-17T11:49:12.000Z' };
      const result = formatTimestamps(obj);
      expect(result.checkedOutAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should format expiresAt field', () => {
      const obj = { expiresAt: '2025-12-17T11:49:12.000Z' };
      const result = formatTimestamps(obj);
      expect(result.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should format detectedAt field', () => {
      const obj = { detectedAt: '2025-12-17T11:49:12.000Z' };
      const result = formatTimestamps(obj);
      expect(result.detectedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should format resolvedAt field', () => {
      const obj = { resolvedAt: '2025-12-17T11:49:12.000Z' };
      const result = formatTimestamps(obj);
      expect(result.resolvedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should format exportedAt field', () => {
      const obj = { exportedAt: '2025-12-17T11:49:12.000Z' };
      const result = formatTimestamps(obj);
      expect(result.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should format validUntil field', () => {
      const obj = { validUntil: '2025-12-17T11:49:12.000Z' };
      const result = formatTimestamps(obj);
      expect(result.validUntil).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should not format non-timestamp fields', () => {
      const obj = { name: '2025-12-17T11:49:12.000Z', id: 123 };
      const result = formatTimestamps(obj);
      expect(result.name).toBe('2025-12-17T11:49:12.000Z');
      expect(result.id).toBe(123);
    });

    it('should handle nested objects', () => {
      const obj = {
        data: {
          createdAt: '2025-12-17T11:49:12.000Z',
          name: 'test',
        },
      };
      const result = formatTimestamps(obj);
      expect(result.data.createdAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(result.data.name).toBe('test');
    });

    it('should handle arrays', () => {
      const arr = [
        { createdAt: '2025-12-17T11:49:12.000Z' },
        { createdAt: '2025-12-18T12:00:00.000Z' },
      ];
      const result = formatTimestamps(arr);
      expect(result[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(result[1].createdAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should handle deeply nested structures', () => {
      const obj = {
        level1: {
          level2: {
            level3: {
              createdAt: '2025-12-17T11:49:12.000Z',
            },
          },
        },
      };
      const result = formatTimestamps(obj);
      expect(result.level1.level2.level3.createdAt).toMatch(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
      );
    });

    it('should handle mixed arrays and objects', () => {
      const obj = {
        items: [
          { updatedAt: '2025-12-17T11:49:12.000Z' },
          { nested: { createdAt: '2025-12-17T12:00:00.000Z' } },
        ],
      };
      const result = formatTimestamps(obj);
      expect(result.items[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(result.items[1].nested.createdAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should not mutate original object', () => {
      const original = { createdAt: '2025-12-17T11:49:12.000Z' };
      const copy = JSON.parse(JSON.stringify(original));
      formatTimestamps(original);
      expect(original).toEqual(copy);
    });

    it('should handle timestamp field with non-string value', () => {
      const obj = { createdAt: 123456789 };
      const result = formatTimestamps(obj);
      expect(result.createdAt).toBe(123456789);
    });

    it('should handle null values in nested objects', () => {
      const obj = { data: null, createdAt: '2025-12-17T11:49:12.000Z' };
      const result = formatTimestamps(obj);
      expect(result.data).toBeNull();
      expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
  });
});
