import { describe, it, expect } from 'vitest';
import {
  createMergedContent,
  calculateRecencyScore,
  getAgeDays,
} from '../../src/services/consolidation/helpers.js';

describe('Consolidation Helpers', () => {
  describe('createMergedContent', () => {
    it('should return primary content when no unique additions', () => {
      const primary = 'This is the primary content. It has multiple sentences.';
      const members = ['This is the primary content. It has multiple sentences.'];

      const result = createMergedContent(primary, members);

      expect(result).toBe(primary);
    });

    it('should append unique sentences from members', () => {
      const primary = 'The first point is important.';
      const members = ['The second point is also important.'];

      const result = createMergedContent(primary, members);

      expect(result).toContain(primary);
      expect(result).toContain('The second point is also important');
      expect(result).toContain('[Consolidated from similar entries:]');
    });

    it('should deduplicate case-insensitively', () => {
      const primary = 'The cat sat on the mat.';
      const members = ['THE CAT SAT ON THE MAT.'];

      const result = createMergedContent(primary, members);

      expect(result).toBe(primary);
    });

    it('should filter short sentences', () => {
      const primary = 'This is a longer sentence that should be included.';
      const members = ['Short. Too short. This is also a longer sentence that should be found.'];

      const result = createMergedContent(primary, members);

      expect(result).toContain('This is also a longer sentence');
      // Short sentences should be excluded (< 10 chars)
    });

    it('should handle multiple member contents', () => {
      const primary = 'Primary content here with details.';
      const members = [
        'First member has unique info here.',
        'Second member adds more unique content.',
      ];

      const result = createMergedContent(primary, members);

      expect(result).toContain('First member has unique info');
      expect(result).toContain('Second member adds more unique');
    });

    it('should handle empty member array', () => {
      const primary = 'Primary content stays the same.';

      const result = createMergedContent(primary, []);

      expect(result).toBe(primary);
    });

    it('should handle empty strings in members', () => {
      const primary = 'Primary content stays intact.';
      const members = ['', '   ', 'New unique content is added here.'];

      const result = createMergedContent(primary, members);

      expect(result).toContain('New unique content is added');
    });

    it('should handle sentences ending with different punctuation', () => {
      const primary = 'This is a question about something?';
      const members = ['This is an exclamation about something!'];

      const result = createMergedContent(primary, members);

      expect(result).toContain('[Consolidated from similar entries:]');
    });
  });

  describe('calculateRecencyScore', () => {
    it('should return 1 for 0 days', () => {
      expect(calculateRecencyScore(0)).toBe(1);
    });

    it('should return 1 for negative days', () => {
      expect(calculateRecencyScore(-5)).toBe(1);
    });

    it('should return 0.5 at half-life', () => {
      const result = calculateRecencyScore(30, 30);
      expect(result).toBeCloseTo(0.5, 5);
    });

    it('should return 0.25 at twice half-life', () => {
      const result = calculateRecencyScore(60, 30);
      expect(result).toBeCloseTo(0.25, 5);
    });

    it('should use default half-life of 30 days', () => {
      const result = calculateRecencyScore(30);
      expect(result).toBeCloseTo(0.5, 5);
    });

    it('should return very small value for old entries', () => {
      const result = calculateRecencyScore(365, 30);
      expect(result).toBeLessThan(0.001);
    });

    it('should handle custom half-life', () => {
      const result = calculateRecencyScore(14, 14);
      expect(result).toBeCloseTo(0.5, 5);
    });

    it('should return high score for recent entries', () => {
      const result = calculateRecencyScore(1, 30);
      expect(result).toBeGreaterThan(0.97);
    });
  });

  describe('getAgeDays', () => {
    it('should return null for null timestamp', () => {
      expect(getAgeDays(null)).toBeNull();
    });

    it('should return null for undefined timestamp', () => {
      expect(getAgeDays(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(getAgeDays('')).toBeNull();
    });

    it('should return null for invalid date string', () => {
      expect(getAgeDays('not-a-date')).toBeNull();
    });

    it('should return 0 for current timestamp', () => {
      const now = new Date().toISOString();
      const result = getAgeDays(now);
      expect(result).not.toBeNull();
      expect(result!).toBeCloseTo(0, 0);
    });

    it('should return approximately 1 for yesterday', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const result = getAgeDays(yesterday);
      expect(result).not.toBeNull();
      expect(result!).toBeCloseTo(1, 1);
    });

    it('should return approximately 7 for a week ago', () => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const result = getAgeDays(weekAgo);
      expect(result).not.toBeNull();
      expect(result!).toBeCloseTo(7, 1);
    });

    it('should return positive value for past dates', () => {
      const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const result = getAgeDays(pastDate);
      expect(result).not.toBeNull();
      expect(result!).toBeGreaterThan(0);
    });

    it('should handle future dates by returning 0', () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const result = getAgeDays(futureDate);
      expect(result).not.toBeNull();
      expect(result!).toBe(0);
    });

    it('should handle date-only strings', () => {
      const dateOnly = '2020-01-01';
      const result = getAgeDays(dateOnly);
      expect(result).not.toBeNull();
      expect(result!).toBeGreaterThan(0);
    });

    it('should handle various valid ISO formats', () => {
      const formats = [
        '2024-01-15T12:00:00.000Z',
        '2024-01-15T12:00:00Z',
        '2024-01-15',
      ];

      for (const format of formats) {
        const result = getAgeDays(format);
        expect(result).not.toBeNull();
        expect(result!).toBeGreaterThan(0);
      }
    });
  });
});
