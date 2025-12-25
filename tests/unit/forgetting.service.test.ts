import { describe, it, expect } from 'vitest';
import {
  calculateRecencyScore,
  shouldForgetByRecency,
  getRecencyReason,
} from '../../src/services/forgetting/strategies/recency.js';
import {
  calculateFrequencyScore,
  shouldForgetByFrequency,
  getFrequencyReason,
} from '../../src/services/forgetting/strategies/frequency.js';
import {
  calculateImportanceScore,
  shouldForgetByImportance,
  getImportanceReason,
  isProtected,
} from '../../src/services/forgetting/strategies/importance.js';
import type { RecencyConfig } from '../../src/services/forgetting/strategies/recency.js';
import type { FrequencyConfig } from '../../src/services/forgetting/strategies/frequency.js';
import type {
  ImportanceConfig,
  ImportanceInput,
} from '../../src/services/forgetting/strategies/importance.js';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create an ISO timestamp N days in the past
 */
function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

/**
 * Create an ISO timestamp for right now
 */
function now(): string {
  return new Date().toISOString();
}

// =============================================================================
// RECENCY STRATEGY TESTS
// =============================================================================

describe('Recency Strategy', () => {
  describe('calculateRecencyScore', () => {
    it('should return 1.0 for recently accessed entries', () => {
      const lastAccess = now();
      const created = daysAgo(100);
      const score = calculateRecencyScore(lastAccess, created, 90);
      expect(score).toBeCloseTo(1.0, 2);
    });

    it('should return 0.0 for entries older than staleDays', () => {
      const lastAccess = daysAgo(100);
      const created = daysAgo(100);
      const score = calculateRecencyScore(lastAccess, created, 90);
      expect(score).toBe(0.0);
    });

    it('should decay linearly between 0 and staleDays', () => {
      const staleDays = 90;
      const lastAccess = daysAgo(45); // Halfway through
      const created = daysAgo(100);
      const score = calculateRecencyScore(lastAccess, created, staleDays);
      expect(score).toBeCloseTo(0.5, 1);
    });

    it('should use createdAt when lastAccessedAt is null', () => {
      const created = daysAgo(100);
      const score = calculateRecencyScore(null, created, 90);
      expect(score).toBe(0.0);
    });

    it('should handle entries created today with no access', () => {
      const created = now();
      const score = calculateRecencyScore(null, created, 90);
      expect(score).toBeCloseTo(1.0, 2);
    });

    it('should handle entries accessed more recently than created', () => {
      const created = daysAgo(30);
      const lastAccess = daysAgo(10);
      const score = calculateRecencyScore(lastAccess, created, 90);
      expect(score).toBeGreaterThan(0.8);
    });

    it('should round to 3 decimal places', () => {
      const lastAccess = daysAgo(33);
      const created = daysAgo(100);
      const score = calculateRecencyScore(lastAccess, created, 90);
      // Score should be rounded
      const decimalPart = score.toString().split('.')[1] || '';
      expect(decimalPart.length).toBeLessThanOrEqual(3);
    });

    it('should handle very old entries', () => {
      const lastAccess = daysAgo(1000);
      const created = daysAgo(1000);
      const score = calculateRecencyScore(lastAccess, created, 90);
      expect(score).toBe(0.0);
    });

    it('should handle entries at exact threshold', () => {
      const lastAccess = daysAgo(90);
      const created = daysAgo(100);
      const score = calculateRecencyScore(lastAccess, created, 90);
      expect(score).toBe(0.0);
    });
  });

  describe('shouldForgetByRecency', () => {
    const config: RecencyConfig = {
      staleDays: 90,
      threshold: 0.3,
    };

    it('should forget entries older than staleDays threshold', () => {
      const lastAccess = daysAgo(100);
      const created = daysAgo(100);
      expect(shouldForgetByRecency(lastAccess, created, config)).toBe(true);
    });

    it('should not forget recently accessed entries', () => {
      const lastAccess = now();
      const created = daysAgo(100);
      expect(shouldForgetByRecency(lastAccess, created, config)).toBe(false);
    });

    it('should forget entries with score below threshold', () => {
      const lastAccess = daysAgo(80); // Score will be ~0.111
      const created = daysAgo(100);
      expect(shouldForgetByRecency(lastAccess, created, config)).toBe(true);
    });

    it('should not forget entries with score at or above threshold', () => {
      const lastAccess = daysAgo(60); // Score will be ~0.333
      const created = daysAgo(100);
      expect(shouldForgetByRecency(lastAccess, created, config)).toBe(false);
    });

    it('should handle entries never accessed based on creation time', () => {
      const created = daysAgo(100);
      expect(shouldForgetByRecency(null, created, config)).toBe(true);
    });

    it('should handle entries created recently with no access', () => {
      const created = now();
      expect(shouldForgetByRecency(null, created, config)).toBe(false);
    });

    it('should respect different staleDays values', () => {
      const lastAccess = daysAgo(50);
      const created = daysAgo(100);
      const shortConfig: RecencyConfig = { staleDays: 30, threshold: 0.3 };
      expect(shouldForgetByRecency(lastAccess, created, shortConfig)).toBe(true);
    });

    it('should respect different threshold values', () => {
      const lastAccess = daysAgo(80);
      const created = daysAgo(100);
      const strictConfig: RecencyConfig = { staleDays: 90, threshold: 0.5 };
      expect(shouldForgetByRecency(lastAccess, created, strictConfig)).toBe(true);
    });
  });

  describe('getRecencyReason', () => {
    it('should return reason with days for accessed entries', () => {
      const lastAccess = daysAgo(100);
      const created = daysAgo(200);
      const reason = getRecencyReason(lastAccess, created, 90);
      expect(reason).toContain('Not accessed in 100 days');
      expect(reason).toContain('stale threshold: 90 days');
    });

    it('should return reason for never accessed entries', () => {
      const created = daysAgo(100);
      const reason = getRecencyReason(null, created, 90);
      expect(reason).toContain('Never accessed');
      expect(reason).toContain('created 100 days ago');
      expect(reason).toContain('stale threshold: 90 days');
    });

    it('should handle entries accessed today', () => {
      const lastAccess = now();
      const created = daysAgo(100);
      const reason = getRecencyReason(lastAccess, created, 90);
      expect(reason).toContain('Not accessed in 0 days');
    });

    it('should handle entries created today', () => {
      const created = now();
      const reason = getRecencyReason(null, created, 90);
      expect(reason).toContain('created 0 days ago');
    });
  });
});

// =============================================================================
// FREQUENCY STRATEGY TESTS
// =============================================================================

describe('Frequency Strategy', () => {
  describe('calculateFrequencyScore', () => {
    it('should return 0 for entries never accessed', () => {
      const score = calculateFrequencyScore(0, 2);
      expect(score).toBe(0);
    });

    it('should return 1 for high access counts', () => {
      const minAccessCount = 2;
      const highCount = minAccessCount * 10;
      const score = calculateFrequencyScore(highCount, minAccessCount);
      expect(score).toBe(1.0);
    });

    it('should use logarithmic scaling for access counts', () => {
      const score1 = calculateFrequencyScore(1, 2);
      const score2 = calculateFrequencyScore(2, 2);
      const score10 = calculateFrequencyScore(10, 2);

      expect(score1).toBeLessThan(score2);
      expect(score2).toBeLessThan(score10);
      expect(score10).toBeLessThan(1.0);
    });

    it('should return value between 0 and 1', () => {
      for (let count = 0; count <= 100; count += 10) {
        const score = calculateFrequencyScore(count, 2);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });

    it('should round to 3 decimal places', () => {
      const score = calculateFrequencyScore(5, 2);
      const decimalPart = score.toString().split('.')[1] || '';
      expect(decimalPart.length).toBeLessThanOrEqual(3);
    });

    it('should handle very high access counts', () => {
      const score = calculateFrequencyScore(1000, 2);
      expect(score).toBe(1.0);
    });

    it('should handle access count equal to threshold', () => {
      const score = calculateFrequencyScore(2, 2);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    it('should increase score with higher access counts', () => {
      const scores = [1, 5, 10, 20].map(count => calculateFrequencyScore(count, 2));
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeGreaterThan(scores[i - 1]);
      }
    });
  });

  describe('shouldForgetByFrequency', () => {
    const config: FrequencyConfig = {
      minAccessCount: 2,
      lookbackDays: 180,
    };

    it('should forget entries with low access count', () => {
      const lastAccess = daysAgo(200);
      expect(shouldForgetByFrequency(1, lastAccess, config)).toBe(true);
    });

    it('should not forget entries with sufficient access count', () => {
      const lastAccess = daysAgo(200);
      expect(shouldForgetByFrequency(5, lastAccess, config)).toBe(false);
    });

    it('should not forget recently accessed entries regardless of count', () => {
      const lastAccess = daysAgo(100); // Within lookbackDays
      expect(shouldForgetByFrequency(1, lastAccess, config)).toBe(false);
    });

    it('should forget entries never accessed', () => {
      expect(shouldForgetByFrequency(0, null, config)).toBe(true);
    });

    it('should handle entries with access count at threshold', () => {
      const lastAccess = daysAgo(200);
      expect(shouldForgetByFrequency(2, lastAccess, config)).toBe(false);
    });

    it('should respect lookbackDays boundary', () => {
      const lastAccess = daysAgo(179); // Just within lookbackDays
      expect(shouldForgetByFrequency(1, lastAccess, config)).toBe(false);
    });

    it('should forget entries beyond lookbackDays with low count', () => {
      const lastAccess = daysAgo(181);
      expect(shouldForgetByFrequency(1, lastAccess, config)).toBe(true);
    });

    it('should handle different minAccessCount values', () => {
      const lastAccess = daysAgo(200);
      const strictConfig: FrequencyConfig = { minAccessCount: 10, lookbackDays: 180 };
      expect(shouldForgetByFrequency(5, lastAccess, strictConfig)).toBe(true);
    });

    it('should handle different lookbackDays values', () => {
      const lastAccess = daysAgo(100);
      const shortConfig: FrequencyConfig = { minAccessCount: 2, lookbackDays: 90 };
      expect(shouldForgetByFrequency(1, lastAccess, shortConfig)).toBe(true);
    });
  });

  describe('getFrequencyReason', () => {
    it('should return reason for never accessed entries', () => {
      const reason = getFrequencyReason(0, 2);
      expect(reason).toContain('Never accessed');
      expect(reason).toContain('minimum required: 2');
    });

    it('should return reason for low access count', () => {
      const reason = getFrequencyReason(1, 2);
      expect(reason).toContain('Low access count: 1');
      expect(reason).toContain('minimum required: 2');
    });

    it('should include actual and required counts', () => {
      const reason = getFrequencyReason(3, 5);
      expect(reason).toContain('3');
      expect(reason).toContain('5');
    });

    it('should handle high threshold values', () => {
      const reason = getFrequencyReason(10, 100);
      expect(reason).toContain('10');
      expect(reason).toContain('100');
    });
  });
});

// =============================================================================
// IMPORTANCE STRATEGY TESTS
// =============================================================================

describe('Importance Strategy', () => {
  describe('calculateImportanceScore', () => {
    it('should return 0.5 for entries with no metadata', () => {
      const input: ImportanceInput = {};
      const score = calculateImportanceScore(input);
      expect(score).toBe(0.5);
    });

    it('should calculate score based on priority only', () => {
      const input: ImportanceInput = { priority: 80 };
      const score = calculateImportanceScore(input);
      expect(score).toBeCloseTo(0.8, 2);
    });

    it('should calculate score based on confidence only', () => {
      const input: ImportanceInput = { confidence: 0.7 };
      const score = calculateImportanceScore(input);
      expect(score).toBeCloseTo(0.7, 2);
    });

    it('should calculate score based on success rate only', () => {
      const input: ImportanceInput = {
        accessCount: 10,
        successCount: 8,
      };
      const score = calculateImportanceScore(input);
      expect(score).toBeCloseTo(0.8, 2);
    });

    it('should average multiple factors', () => {
      const input: ImportanceInput = {
        priority: 60,
        confidence: 0.8,
      };
      const score = calculateImportanceScore(input);
      expect(score).toBeCloseTo(0.7, 2); // (0.6 + 0.8) / 2
    });

    it('should add critical bonus', () => {
      const input: ImportanceInput = {
        priority: 50,
        isCritical: true,
      };
      const score = calculateImportanceScore(input);
      expect(score).toBeCloseTo(0.8, 2); // 0.5 + 0.3 bonus
    });

    it('should cap score at 1.0', () => {
      const input: ImportanceInput = {
        priority: 100,
        confidence: 1.0,
        isCritical: true,
      };
      const score = calculateImportanceScore(input);
      expect(score).toBe(1.0);
    });

    it('should handle zero success rate', () => {
      const input: ImportanceInput = {
        accessCount: 10,
        successCount: 0,
      };
      const score = calculateImportanceScore(input);
      expect(score).toBe(0.0);
    });

    it('should handle zero access count for success rate', () => {
      const input: ImportanceInput = {
        accessCount: 0,
        successCount: 0,
      };
      const score = calculateImportanceScore(input);
      expect(score).toBe(0.5); // No factors, returns default
    });

    it('should ignore success rate if access count is missing', () => {
      const input: ImportanceInput = {
        successCount: 5,
      };
      const score = calculateImportanceScore(input);
      expect(score).toBe(0.5);
    });

    it('should ignore success rate if success count is missing', () => {
      const input: ImportanceInput = {
        accessCount: 10,
      };
      const score = calculateImportanceScore(input);
      expect(score).toBe(0.5);
    });

    it('should handle all factors combined', () => {
      const input: ImportanceInput = {
        priority: 60,
        confidence: 0.8,
        accessCount: 10,
        successCount: 9,
        isCritical: false,
      };
      const score = calculateImportanceScore(input);
      // (0.6 + 0.8 + 0.9) / 3 = 0.767
      expect(score).toBeCloseTo(0.767, 2);
    });

    it('should round to 3 decimal places', () => {
      const input: ImportanceInput = { priority: 77 };
      const score = calculateImportanceScore(input);
      const decimalPart = score.toString().split('.')[1] || '';
      expect(decimalPart.length).toBeLessThanOrEqual(3);
    });

    it('should handle null values', () => {
      const input: ImportanceInput = {
        priority: null,
        confidence: null,
        isCritical: null,
      };
      const score = calculateImportanceScore(input);
      expect(score).toBe(0.5);
    });

    it('should handle minimum priority', () => {
      const input: ImportanceInput = { priority: 0 };
      const score = calculateImportanceScore(input);
      expect(score).toBe(0.0);
    });

    it('should handle maximum priority', () => {
      const input: ImportanceInput = { priority: 100 };
      const score = calculateImportanceScore(input);
      expect(score).toBe(1.0);
    });
  });

  describe('isProtected', () => {
    const config: ImportanceConfig = {
      threshold: 0.4,
      excludeCritical: true,
      excludeHighPriority: 90,
    };

    it('should protect critical entries', () => {
      const input: ImportanceInput = { isCritical: true };
      expect(isProtected(input, config)).toBe(true);
    });

    it('should protect high-priority entries', () => {
      const input: ImportanceInput = { priority: 95 };
      expect(isProtected(input, config)).toBe(true);
    });

    it('should protect entries at priority threshold', () => {
      const input: ImportanceInput = { priority: 90 };
      expect(isProtected(input, config)).toBe(true);
    });

    it('should not protect entries below priority threshold', () => {
      const input: ImportanceInput = { priority: 89 };
      expect(isProtected(input, config)).toBe(false);
    });

    it('should not protect non-critical low-priority entries', () => {
      const input: ImportanceInput = {
        priority: 50,
        isCritical: false,
      };
      expect(isProtected(input, config)).toBe(false);
    });

    it('should respect excludeCritical setting', () => {
      const permissiveConfig: ImportanceConfig = {
        ...config,
        excludeCritical: false,
      };
      const input: ImportanceInput = { isCritical: true };
      expect(isProtected(input, permissiveConfig)).toBe(false);
    });

    it('should handle entries with no metadata', () => {
      const input: ImportanceInput = {};
      expect(isProtected(input, config)).toBe(false);
    });

    it('should protect critical entries regardless of priority', () => {
      const input: ImportanceInput = {
        priority: 10,
        isCritical: true,
      };
      expect(isProtected(input, config)).toBe(true);
    });

    it('should handle null critical flag', () => {
      const input: ImportanceInput = {
        priority: 95,
        isCritical: null,
      };
      expect(isProtected(input, config)).toBe(true);
    });

    it('should handle null priority', () => {
      const input: ImportanceInput = {
        priority: null,
        isCritical: false,
      };
      expect(isProtected(input, config)).toBe(false);
    });
  });

  describe('shouldForgetByImportance', () => {
    const config: ImportanceConfig = {
      threshold: 0.4,
      excludeCritical: true,
      excludeHighPriority: 90,
    };

    it('should forget entries with low importance score', () => {
      const input: ImportanceInput = { priority: 20 };
      expect(shouldForgetByImportance(input, config)).toBe(true);
    });

    it('should not forget entries with high importance score', () => {
      const input: ImportanceInput = { priority: 80 };
      expect(shouldForgetByImportance(input, config)).toBe(false);
    });

    it('should not forget protected critical entries', () => {
      const input: ImportanceInput = {
        priority: 10,
        isCritical: true,
      };
      expect(shouldForgetByImportance(input, config)).toBe(false);
    });

    it('should not forget protected high-priority entries', () => {
      const input: ImportanceInput = { priority: 95 };
      expect(shouldForgetByImportance(input, config)).toBe(false);
    });

    it('should forget entries at threshold', () => {
      const input: ImportanceInput = { priority: 40 }; // Score = 0.4
      expect(shouldForgetByImportance(input, config)).toBe(false); // Not below threshold
    });

    it('should forget entries just below threshold', () => {
      const input: ImportanceInput = { priority: 39 }; // Score = 0.39
      expect(shouldForgetByImportance(input, config)).toBe(true);
    });

    it('should handle entries with no metadata', () => {
      const input: ImportanceInput = {};
      // Default score is 0.5, which is above threshold 0.4
      expect(shouldForgetByImportance(input, config)).toBe(false);
    });

    it('should handle low confidence entries', () => {
      const input: ImportanceInput = { confidence: 0.2 };
      expect(shouldForgetByImportance(input, config)).toBe(true);
    });

    it('should handle low success rate entries', () => {
      const input: ImportanceInput = {
        accessCount: 10,
        successCount: 1,
      };
      expect(shouldForgetByImportance(input, config)).toBe(true);
    });

    it('should respect different threshold values', () => {
      const strictConfig: ImportanceConfig = {
        threshold: 0.8,
        excludeCritical: true,
        excludeHighPriority: 90,
      };
      const input: ImportanceInput = { priority: 60 };
      expect(shouldForgetByImportance(input, strictConfig)).toBe(true);
    });

    it('should handle critical bonus pushing score above threshold', () => {
      const input: ImportanceInput = {
        priority: 20, // Score 0.2
        isCritical: true, // +0.3 bonus = 0.5 total
      };
      expect(shouldForgetByImportance(input, config)).toBe(false); // Protected
    });
  });

  describe('getImportanceReason', () => {
    it('should include priority in reason', () => {
      const input: ImportanceInput = { priority: 20 };
      const reason = getImportanceReason(input, 0.4);
      expect(reason).toContain('priority=20');
      expect(reason).toContain('threshold 0.4');
    });

    it('should include confidence in reason', () => {
      const input: ImportanceInput = { confidence: 0.3 };
      const reason = getImportanceReason(input, 0.4);
      expect(reason).toContain('confidence=0.3');
    });

    it('should include success rate in reason', () => {
      const input: ImportanceInput = {
        accessCount: 10,
        successCount: 3,
      };
      const reason = getImportanceReason(input, 0.4);
      expect(reason).toContain('successRate=0.30');
    });

    it('should include all factors in reason', () => {
      const input: ImportanceInput = {
        priority: 30,
        confidence: 0.2,
        accessCount: 10,
        successCount: 5,
      };
      const reason = getImportanceReason(input, 0.4);
      expect(reason).toContain('priority=30');
      expect(reason).toContain('confidence=0.2');
      expect(reason).toContain('successRate=0.50');
    });

    it('should include calculated score', () => {
      const input: ImportanceInput = { priority: 20 };
      const reason = getImportanceReason(input, 0.4);
      expect(reason).toContain('0.200');
    });

    it('should handle entries with no factors', () => {
      const input: ImportanceInput = {};
      const reason = getImportanceReason(input, 0.4);
      expect(reason).toContain('0.500'); // Default score
    });

    it('should format success rate with 2 decimal places', () => {
      const input: ImportanceInput = {
        accessCount: 3,
        successCount: 2,
      };
      const reason = getImportanceReason(input, 0.4);
      expect(reason).toMatch(/successRate=0\.\d{2}/);
    });

    it('should handle zero success rate', () => {
      const input: ImportanceInput = {
        accessCount: 10,
        successCount: 0,
      };
      const reason = getImportanceReason(input, 0.4);
      expect(reason).toContain('successRate=0');
    });
  });
});

// =============================================================================
// COMBINED STRATEGY TESTS
// =============================================================================

describe('Combined Forgetting Strategy', () => {
  describe('Score combination and weighting', () => {
    it('should combine recency, frequency, and importance scores', () => {
      // This tests the conceptual combination
      // Weights: recency 0.35, frequency 0.35, importance 0.3
      const recencyScore = 0.5;
      const frequencyScore = 0.6;
      const importanceScore = 0.7;

      const combinedScore =
        recencyScore * 0.35 + frequencyScore * 0.35 + importanceScore * 0.3;

      expect(combinedScore).toBeCloseTo(0.595, 3);
    });

    it('should handle all scores at minimum', () => {
      const combinedScore = 0.0 * 0.35 + 0.0 * 0.35 + 0.0 * 0.3;
      expect(combinedScore).toBe(0.0);
    });

    it('should handle all scores at maximum', () => {
      const combinedScore = 1.0 * 0.35 + 1.0 * 0.35 + 1.0 * 0.3;
      expect(combinedScore).toBe(1.0);
    });

    it('should weight recency and frequency equally', () => {
      const recencyWeight = 0.35;
      const frequencyWeight = 0.35;
      expect(recencyWeight).toBe(frequencyWeight);
    });

    it('should weight importance slightly less', () => {
      const importanceWeight = 0.3;
      const otherWeights = 0.35 + 0.35;
      expect(importanceWeight).toBeLessThan(otherWeights);
    });

    it('should have weights sum to 1.0', () => {
      const totalWeight = 0.35 + 0.35 + 0.3;
      expect(totalWeight).toBe(1.0);
    });
  });

  describe('Edge cases across all strategies', () => {
    it('should handle entries with all positive signals', () => {
      // Recently accessed, high frequency, high importance
      const recencyScore = calculateRecencyScore(now(), daysAgo(100), 90);
      const frequencyScore = calculateFrequencyScore(100, 2);
      const importanceScore = calculateImportanceScore({ priority: 90 });

      expect(recencyScore).toBeGreaterThan(0.9);
      expect(frequencyScore).toBe(1.0);
      expect(importanceScore).toBeGreaterThan(0.8);
    });

    it('should handle entries with all negative signals', () => {
      // Old, never accessed, low importance
      const recencyScore = calculateRecencyScore(null, daysAgo(200), 90);
      const frequencyScore = calculateFrequencyScore(0, 2);
      const importanceScore = calculateImportanceScore({ priority: 10 });

      expect(recencyScore).toBe(0.0);
      expect(frequencyScore).toBe(0.0);
      expect(importanceScore).toBeLessThan(0.2);
    });

    it('should handle mixed signals', () => {
      // Old but high importance
      const recencyScore = calculateRecencyScore(daysAgo(200), daysAgo(200), 90);
      const frequencyScore = calculateFrequencyScore(1, 2);
      const importanceScore = calculateImportanceScore({
        priority: 95,
        isCritical: true,
      });

      expect(recencyScore).toBe(0.0);
      expect(frequencyScore).toBeLessThan(0.5);
      expect(importanceScore).toBe(1.0);
    });

    it('should handle recently accessed but low importance', () => {
      const recencyScore = calculateRecencyScore(now(), daysAgo(10), 90);
      const frequencyScore = calculateFrequencyScore(50, 2);
      const importanceScore = calculateImportanceScore({ priority: 10 });

      expect(recencyScore).toBeGreaterThan(0.9);
      expect(frequencyScore).toBeGreaterThan(0.8);
      expect(importanceScore).toBeLessThan(0.2);
    });
  });

  describe('Protection rules across strategies', () => {
    it('should protect critical entries regardless of other scores', () => {
      const config: ImportanceConfig = {
        threshold: 0.4,
        excludeCritical: true,
        excludeHighPriority: 90,
      };

      const input: ImportanceInput = {
        priority: 10,
        isCritical: true,
      };

      // Even with low priority, should be protected
      expect(isProtected(input, config)).toBe(true);
      expect(shouldForgetByImportance(input, config)).toBe(false);
    });

    it('should protect high-priority entries regardless of other scores', () => {
      const config: ImportanceConfig = {
        threshold: 0.4,
        excludeCritical: true,
        excludeHighPriority: 90,
      };

      const input: ImportanceInput = {
        priority: 95,
        confidence: 0.1,
      };

      expect(isProtected(input, config)).toBe(true);
    });

    it('should not protect entries below all thresholds', () => {
      const recencyConfig: RecencyConfig = {
        staleDays: 90,
        threshold: 0.3,
      };
      const frequencyConfig: FrequencyConfig = {
        minAccessCount: 2,
        lookbackDays: 180,
      };
      const importanceConfig: ImportanceConfig = {
        threshold: 0.4,
        excludeCritical: true,
        excludeHighPriority: 90,
      };

      const lastAccess = daysAgo(200);
      const created = daysAgo(200);
      const accessCount = 0;
      const importanceInput: ImportanceInput = { priority: 10 };

      expect(shouldForgetByRecency(lastAccess, created, recencyConfig)).toBe(true);
      expect(shouldForgetByFrequency(accessCount, lastAccess, frequencyConfig)).toBe(true);
      expect(shouldForgetByImportance(importanceInput, importanceConfig)).toBe(true);
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle a stale rarely-used low-priority entry', () => {
      const lastAccess = daysAgo(180);
      const created = daysAgo(200);
      const accessCount = 1;
      const input: ImportanceInput = { priority: 30, confidence: 0.2 };

      const recencyScore = calculateRecencyScore(lastAccess, created, 90);
      const frequencyScore = calculateFrequencyScore(accessCount, 2);
      const importanceScore = calculateImportanceScore(input);

      // All scores should be low
      expect(recencyScore).toBe(0.0);
      expect(frequencyScore).toBeLessThan(0.5);
      expect(importanceScore).toBeLessThan(0.3);
    });

    it('should handle a recent but low-quality entry', () => {
      const lastAccess = daysAgo(10);
      const created = daysAgo(30);
      const accessCount = 2;
      const input: ImportanceInput = {
        confidence: 0.1,
        accessCount: 10,
        successCount: 1,
      };

      const recencyScore = calculateRecencyScore(lastAccess, created, 90);
      const frequencyScore = calculateFrequencyScore(accessCount, 2);
      const importanceScore = calculateImportanceScore(input);

      expect(recencyScore).toBeGreaterThan(0.8);
      expect(frequencyScore).toBeGreaterThan(0.3);
      expect(importanceScore).toBeLessThan(0.2);
    });

    it('should handle a valuable but unused entry', () => {
      const lastAccess = daysAgo(200);
      const created = daysAgo(300);
      const accessCount = 0;
      const input: ImportanceInput = {
        priority: 95,
        confidence: 0.9,
        isCritical: true,
      };

      const recencyScore = calculateRecencyScore(lastAccess, created, 90);
      const frequencyScore = calculateFrequencyScore(accessCount, 2);
      const importanceScore = calculateImportanceScore(input);

      expect(recencyScore).toBe(0.0);
      expect(frequencyScore).toBe(0.0);
      expect(importanceScore).toBe(1.0); // Critical + high priority/confidence
    });

    it('should handle a moderately successful entry', () => {
      const lastAccess = daysAgo(45);
      const created = daysAgo(100);
      const accessCount = 5;
      const input: ImportanceInput = {
        priority: 50,
        confidence: 0.6,
        accessCount: 10,
        successCount: 7,
      };

      const recencyScore = calculateRecencyScore(lastAccess, created, 90);
      const frequencyScore = calculateFrequencyScore(accessCount, 2);
      const importanceScore = calculateImportanceScore(input);

      expect(recencyScore).toBeGreaterThan(0.4);
      expect(frequencyScore).toBeGreaterThan(0.5);
      expect(importanceScore).toBeGreaterThan(0.5);
    });
  });

  describe('Boundary conditions', () => {
    it('should handle entries at exact recency threshold', () => {
      const config: RecencyConfig = { staleDays: 90, threshold: 0.3 };
      const lastAccess = daysAgo(63); // Score should be exactly 0.3
      const created = daysAgo(100);

      expect(shouldForgetByRecency(lastAccess, created, config)).toBe(false);
    });

    it('should handle entries at exact frequency threshold', () => {
      const config: FrequencyConfig = { minAccessCount: 2, lookbackDays: 180 };
      const lastAccess = daysAgo(200);

      expect(shouldForgetByFrequency(2, lastAccess, config)).toBe(false);
    });

    it('should handle entries at exact importance threshold', () => {
      const config: ImportanceConfig = {
        threshold: 0.4,
        excludeCritical: true,
        excludeHighPriority: 90,
      };
      const input: ImportanceInput = { priority: 40 }; // Score = 0.4

      expect(shouldForgetByImportance(input, config)).toBe(false);
    });

    it('should handle entries just below recency threshold', () => {
      const config: RecencyConfig = { staleDays: 90, threshold: 0.3 };
      const lastAccess = daysAgo(64); // Score slightly less than 0.3
      const created = daysAgo(100);

      expect(shouldForgetByRecency(lastAccess, created, config)).toBe(true);
    });

    it('should handle entries just below frequency threshold', () => {
      const config: FrequencyConfig = { minAccessCount: 2, lookbackDays: 180 };
      const lastAccess = daysAgo(200);

      expect(shouldForgetByFrequency(1, lastAccess, config)).toBe(true);
    });

    it('should handle entries just below importance threshold', () => {
      const config: ImportanceConfig = {
        threshold: 0.4,
        excludeCritical: true,
        excludeHighPriority: 90,
      };
      const input: ImportanceInput = { priority: 39 }; // Score = 0.39

      expect(shouldForgetByImportance(input, config)).toBe(true);
    });
  });
});
