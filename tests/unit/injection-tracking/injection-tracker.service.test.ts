import { describe, it, expect, beforeEach } from 'vitest';
import {
  InjectionTrackerService,
  createInjectionTrackerService,
} from '../../../src/services/injection-tracking/injection-tracker.service.js';

describe('InjectionTrackerService', () => {
  let tracker: InjectionTrackerService;

  beforeEach(() => {
    tracker = createInjectionTrackerService();
  });

  describe('shouldInject', () => {
    it('should return true for never-injected guideline', () => {
      const result = tracker.shouldInject('session-1', 'guideline-1', null, {
        tokenThreshold: 100000,
      });

      expect(result).toBe(true);
    });

    it('should return false for recently injected guideline in same episode', () => {
      tracker.recordInjection('session-1', 'guideline-1', 'episode-1');

      const result = tracker.shouldInject('session-1', 'guideline-1', 'episode-1', {
        tokenThreshold: 100000,
      });

      expect(result).toBe(false);
    });

    it('should return true when episode changes', () => {
      tracker.recordInjection('session-1', 'guideline-1', 'episode-1');

      const result = tracker.shouldInject('session-1', 'guideline-1', 'episode-2', {
        tokenThreshold: 100000,
      });

      expect(result).toBe(true);
    });

    it('should return true when token threshold exceeded', () => {
      tracker.recordInjection('session-1', 'guideline-1', 'episode-1');
      tracker.incrementTokens('session-1', 100001);

      const result = tracker.shouldInject('session-1', 'guideline-1', 'episode-1', {
        tokenThreshold: 100000,
      });

      expect(result).toBe(true);
    });

    it('should return false when under token threshold', () => {
      tracker.recordInjection('session-1', 'guideline-1', 'episode-1');
      tracker.incrementTokens('session-1', 50000);

      const result = tracker.shouldInject('session-1', 'guideline-1', 'episode-1', {
        tokenThreshold: 100000,
      });

      expect(result).toBe(false);
    });

    it('should return true when forceRefresh is true', () => {
      tracker.recordInjection('session-1', 'guideline-1', 'episode-1');

      const result = tracker.shouldInject('session-1', 'guideline-1', 'episode-1', {
        tokenThreshold: 100000,
        forceRefresh: true,
      });

      expect(result).toBe(true);
    });

    it('should handle null episode transitions', () => {
      tracker.recordInjection('session-1', 'guideline-1', null);

      const resultSameNull = tracker.shouldInject('session-1', 'guideline-1', null, {
        tokenThreshold: 100000,
      });
      expect(resultSameNull).toBe(false);

      const resultNewEpisode = tracker.shouldInject('session-1', 'guideline-1', 'episode-1', {
        tokenThreshold: 100000,
      });
      expect(resultNewEpisode).toBe(true);
    });

    it('should track different sessions independently', () => {
      tracker.recordInjection('session-1', 'guideline-1', 'episode-1');

      const resultSession1 = tracker.shouldInject('session-1', 'guideline-1', 'episode-1', {
        tokenThreshold: 100000,
      });
      const resultSession2 = tracker.shouldInject('session-2', 'guideline-1', 'episode-1', {
        tokenThreshold: 100000,
      });

      expect(resultSession1).toBe(false);
      expect(resultSession2).toBe(true);
    });

    it('should track different guidelines independently', () => {
      tracker.recordInjection('session-1', 'guideline-1', 'episode-1');

      const resultGuideline1 = tracker.shouldInject('session-1', 'guideline-1', 'episode-1', {
        tokenThreshold: 100000,
      });
      const resultGuideline2 = tracker.shouldInject('session-1', 'guideline-2', 'episode-1', {
        tokenThreshold: 100000,
      });

      expect(resultGuideline1).toBe(false);
      expect(resultGuideline2).toBe(true);
    });
  });

  describe('recordInjection', () => {
    it('should record injection and reset token count for that guideline', () => {
      tracker.incrementTokens('session-1', 50000);
      tracker.recordInjection('session-1', 'guideline-1', 'episode-1');

      const result = tracker.shouldInject('session-1', 'guideline-1', 'episode-1', {
        tokenThreshold: 100000,
      });

      expect(result).toBe(false);
    });

    it('should update existing record', () => {
      tracker.recordInjection('session-1', 'guideline-1', 'episode-1');
      tracker.incrementTokens('session-1', 50000);
      tracker.recordInjection('session-1', 'guideline-1', 'episode-2');

      const result = tracker.shouldInject('session-1', 'guideline-1', 'episode-2', {
        tokenThreshold: 100000,
      });

      expect(result).toBe(false);
    });
  });

  describe('incrementTokens', () => {
    it('should increment token count for all guidelines in session', () => {
      tracker.recordInjection('session-1', 'guideline-1', 'episode-1');
      tracker.recordInjection('session-1', 'guideline-2', 'episode-1');

      tracker.incrementTokens('session-1', 60000);
      tracker.incrementTokens('session-1', 50000);

      const result1 = tracker.shouldInject('session-1', 'guideline-1', 'episode-1', {
        tokenThreshold: 100000,
      });
      const result2 = tracker.shouldInject('session-1', 'guideline-2', 'episode-1', {
        tokenThreshold: 100000,
      });

      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });

    it('should not affect other sessions', () => {
      tracker.recordInjection('session-1', 'guideline-1', 'episode-1');
      tracker.recordInjection('session-2', 'guideline-1', 'episode-1');

      tracker.incrementTokens('session-1', 150000);

      const result1 = tracker.shouldInject('session-1', 'guideline-1', 'episode-1', {
        tokenThreshold: 100000,
      });
      const result2 = tracker.shouldInject('session-2', 'guideline-1', 'episode-1', {
        tokenThreshold: 100000,
      });

      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });
  });

  describe('clearSession', () => {
    it('should remove all tracking for a session', () => {
      tracker.recordInjection('session-1', 'guideline-1', 'episode-1');
      tracker.recordInjection('session-1', 'guideline-2', 'episode-1');

      tracker.clearSession('session-1');

      const result1 = tracker.shouldInject('session-1', 'guideline-1', 'episode-1', {
        tokenThreshold: 100000,
      });
      const result2 = tracker.shouldInject('session-1', 'guideline-2', 'episode-1', {
        tokenThreshold: 100000,
      });

      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });

    it('should not affect other sessions', () => {
      tracker.recordInjection('session-1', 'guideline-1', 'episode-1');
      tracker.recordInjection('session-2', 'guideline-1', 'episode-1');

      tracker.clearSession('session-1');

      const result1 = tracker.shouldInject('session-1', 'guideline-1', 'episode-1', {
        tokenThreshold: 100000,
      });
      const result2 = tracker.shouldInject('session-2', 'guideline-1', 'episode-1', {
        tokenThreshold: 100000,
      });

      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });
  });

  describe('getSessionStats', () => {
    it('should return stats for a session', () => {
      tracker.recordInjection('session-1', 'guideline-1', 'episode-1');
      tracker.recordInjection('session-1', 'guideline-2', 'episode-1');
      tracker.incrementTokens('session-1', 50000);

      const stats = tracker.getSessionStats('session-1');

      expect(stats.trackedGuidelines).toBe(2);
      expect(stats.totalTokens).toBe(50000);
    });

    it('should return zero stats for unknown session', () => {
      const stats = tracker.getSessionStats('unknown-session');

      expect(stats.trackedGuidelines).toBe(0);
      expect(stats.totalTokens).toBe(0);
    });
  });

  describe('filterGuidelinesForInjection', () => {
    it('should filter out recently injected guidelines', () => {
      tracker.recordInjection('session-1', 'guideline-1', 'episode-1');

      const guidelines = [
        { id: 'guideline-1', content: 'test1' },
        { id: 'guideline-2', content: 'test2' },
        { id: 'guideline-3', content: 'test3' },
      ];

      const filtered = tracker.filterGuidelinesForInjection('session-1', guidelines, 'episode-1', {
        tokenThreshold: 100000,
      });

      expect(filtered).toHaveLength(2);
      expect(filtered.map((g) => g.id)).toEqual(['guideline-2', 'guideline-3']);
    });

    it('should return all guidelines when none previously injected', () => {
      const guidelines = [
        { id: 'guideline-1', content: 'test1' },
        { id: 'guideline-2', content: 'test2' },
      ];

      const filtered = tracker.filterGuidelinesForInjection('session-1', guidelines, 'episode-1', {
        tokenThreshold: 100000,
      });

      expect(filtered).toHaveLength(2);
    });
  });
});
