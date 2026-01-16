/**
 * Tests for Feedback-Based Scoring
 *
 * Tests the feedback multiplier calculation and integration with scoring.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getFeedbackMultiplier,
  FeedbackScoreCache,
  type FeedbackScoringConfig,
} from '../../../src/services/query/feedback-cache.js';
import type { EntryFeedbackScore } from '../../../src/services/feedback/repositories/retrieval.repository.js';

describe('Feedback-Based Scoring', () => {
  describe('getFeedbackMultiplier', () => {
    const defaultConfig: FeedbackScoringConfig = {
      enabled: true,
      boostPerPositive: 0.02, // +2% per positive
      boostMax: 0.1, // max +10%
      penaltyPerNegative: 0.1, // -10% per negative
      penaltyMax: 0.5, // max -50%
    };

    it('should return 1.0 for neutral feedback (netScore === 0)', () => {
      const feedback: EntryFeedbackScore = {
        positiveCount: 2,
        negativeCount: 2,
        netScore: 0,
      };

      const multiplier = getFeedbackMultiplier(feedback, defaultConfig);
      expect(multiplier).toBe(1.0);
    });

    it('should return 1.0 when feedback scoring is disabled', () => {
      const feedback: EntryFeedbackScore = {
        positiveCount: 10,
        negativeCount: 0,
        netScore: 10,
      };

      const disabledConfig = { ...defaultConfig, enabled: false };
      const multiplier = getFeedbackMultiplier(feedback, disabledConfig);
      expect(multiplier).toBe(1.0);
    });

    describe('positive feedback boost', () => {
      it('should apply +2% boost per positive feedback', () => {
        const feedback: EntryFeedbackScore = {
          positiveCount: 1,
          negativeCount: 0,
          netScore: 1,
        };

        const multiplier = getFeedbackMultiplier(feedback, defaultConfig);
        expect(multiplier).toBe(1.02);
      });

      it('should apply +4% boost for 2 positive feedbacks', () => {
        const feedback: EntryFeedbackScore = {
          positiveCount: 2,
          negativeCount: 0,
          netScore: 2,
        };

        const multiplier = getFeedbackMultiplier(feedback, defaultConfig);
        expect(multiplier).toBe(1.04);
      });

      it('should cap boost at +10% regardless of positive count', () => {
        const feedback: EntryFeedbackScore = {
          positiveCount: 10,
          negativeCount: 0,
          netScore: 10,
        };

        const multiplier = getFeedbackMultiplier(feedback, defaultConfig);
        expect(multiplier).toBe(1.1);
      });

      it('should cap boost at +10% even with more than 5 positives', () => {
        const feedback: EntryFeedbackScore = {
          positiveCount: 20,
          negativeCount: 0,
          netScore: 20,
        };

        const multiplier = getFeedbackMultiplier(feedback, defaultConfig);
        expect(multiplier).toBe(1.1);
      });
    });

    describe('negative feedback penalty', () => {
      it('should apply -10% penalty per negative feedback', () => {
        const feedback: EntryFeedbackScore = {
          positiveCount: 0,
          negativeCount: 1,
          netScore: -1,
        };

        const multiplier = getFeedbackMultiplier(feedback, defaultConfig);
        expect(multiplier).toBe(0.9);
      });

      it('should apply -20% penalty for 2 net negative', () => {
        const feedback: EntryFeedbackScore = {
          positiveCount: 0,
          negativeCount: 2,
          netScore: -2,
        };

        const multiplier = getFeedbackMultiplier(feedback, defaultConfig);
        expect(multiplier).toBe(0.8);
      });

      it('should apply graduated penalties: -30%, -40%, -50%', () => {
        expect(
          getFeedbackMultiplier(
            {
              positiveCount: 0,
              negativeCount: 3,
              netScore: -3,
            },
            defaultConfig
          )
        ).toBe(0.7);

        expect(
          getFeedbackMultiplier(
            {
              positiveCount: 0,
              negativeCount: 4,
              netScore: -4,
            },
            defaultConfig
          )
        ).toBe(0.6);

        expect(
          getFeedbackMultiplier(
            {
              positiveCount: 0,
              negativeCount: 5,
              netScore: -5,
            },
            defaultConfig
          )
        ).toBe(0.5);
      });

      it('should cap penalty at -50% (multiplier 0.5)', () => {
        const feedback: EntryFeedbackScore = {
          positiveCount: 0,
          negativeCount: 10,
          netScore: -10,
        };

        const multiplier = getFeedbackMultiplier(feedback, defaultConfig);
        expect(multiplier).toBe(0.5);
      });
    });

    describe('mixed feedback', () => {
      it('should calculate penalty based on net score when negative', () => {
        const feedback: EntryFeedbackScore = {
          positiveCount: 2,
          negativeCount: 4,
          netScore: -2, // Net: 2 - 4 = -2
        };

        const multiplier = getFeedbackMultiplier(feedback, defaultConfig);
        // Penalty of 10% per net negative, so -20%
        expect(multiplier).toBe(0.8);
      });

      it('should calculate boost based on positive count when positive', () => {
        const feedback: EntryFeedbackScore = {
          positiveCount: 5,
          negativeCount: 2,
          netScore: 3, // Net is positive
        };

        const multiplier = getFeedbackMultiplier(feedback, defaultConfig);
        // Boost is based on positiveCount (5 * 0.02 = 0.10 = max)
        expect(multiplier).toBe(1.1);
      });
    });
  });

  describe('FeedbackScoreCache', () => {
    let cache: FeedbackScoreCache;

    beforeEach(() => {
      cache = new FeedbackScoreCache({
        maxSize: 100,
        ttlMs: 1000,
        enabled: true,
      });
    });

    it('should store and retrieve feedback scores', () => {
      const score: EntryFeedbackScore = {
        positiveCount: 3,
        negativeCount: 1,
        netScore: 2,
      };

      cache.set('tool', 'entry-1', score);
      const retrieved = cache.get('tool', 'entry-1');

      expect(retrieved).toEqual(score);
    });

    it('should return null for missing entries', () => {
      const retrieved = cache.get('tool', 'nonexistent');
      expect(retrieved).toBeNull();
    });

    it('should invalidate specific entries', () => {
      cache.set('tool', 'entry-1', { positiveCount: 1, negativeCount: 0, netScore: 1 });
      cache.set('tool', 'entry-2', { positiveCount: 2, negativeCount: 0, netScore: 2 });

      cache.invalidate('tool', 'entry-1');

      expect(cache.get('tool', 'entry-1')).toBeNull();
      expect(cache.get('tool', 'entry-2')).not.toBeNull();
    });

    it('should invalidate all entries', () => {
      cache.set('tool', 'entry-1', { positiveCount: 1, negativeCount: 0, netScore: 1 });
      cache.set('guideline', 'entry-2', { positiveCount: 2, negativeCount: 0, netScore: 2 });

      cache.invalidateAll();

      expect(cache.get('tool', 'entry-1')).toBeNull();
      expect(cache.get('guideline', 'entry-2')).toBeNull();
    });

    it('should not return scores when disabled', () => {
      const disabledCache = new FeedbackScoreCache({
        maxSize: 100,
        ttlMs: 1000,
        enabled: false,
      });

      disabledCache.set('tool', 'entry-1', { positiveCount: 1, negativeCount: 0, netScore: 1 });
      const retrieved = disabledCache.get('tool', 'entry-1');

      expect(retrieved).toBeNull();
    });

    it('should report cache stats', () => {
      cache.set('tool', 'entry-1', { positiveCount: 1, negativeCount: 0, netScore: 1 });
      cache.set('tool', 'entry-2', { positiveCount: 2, negativeCount: 0, netScore: 2 });

      const stats = cache.getStats();

      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(100);
      expect(stats.enabled).toBe(true);
    });
  });
});
