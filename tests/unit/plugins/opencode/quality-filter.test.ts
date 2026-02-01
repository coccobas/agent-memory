import { describe, it, expect } from 'vitest';
import { isGarbageExperience } from '../../../../plugins/opencode/quality-filter.js';

describe('isGarbageExperience', () => {
  describe('REJECTS garbage patterns (returns true)', () => {
    it('rejects "Resolved by re-running X" pattern', () => {
      expect(
        isGarbageExperience('Fixed bash error', 'Tool failed', 'Resolved by re-running bash')
      ).toBe(true);
    });

    it('rejects "Task completed successfully" pattern', () => {
      expect(
        isGarbageExperience(
          'Session complete',
          'Session work: 5 events',
          'Task completed successfully'
        )
      ).toBe(true);
    });

    it('rejects "Session work: N events" pattern with no substance', () => {
      expect(isGarbageExperience('Session work', 'Session work: 12 events', 'Done')).toBe(true);
    });

    it('rejects "Fixed X error" with no additional context', () => {
      expect(isGarbageExperience('Fixed Edit error', 'Error occurred', 'Fixed')).toBe(true);
    });

    it('rejects content under 30 chars total meaningful content', () => {
      expect(isGarbageExperience('Short', 'Too brief', 'Done')).toBe(true);
    });
  });

  describe('PASSES legitimate experiences (returns false)', () => {
    it('passes "Fixed auth by checking token expiry"', () => {
      expect(
        isGarbageExperience(
          'Fixed auth timeout',
          'Token was expiring too quickly',
          'Fixed auth by checking token expiry in jwt.verify() and increasing to 1 hour'
        )
      ).toBe(false);
    });

    it('passes "Discovered API requires Bearer prefix"', () => {
      expect(
        isGarbageExperience(
          'API authentication issue',
          'Getting 401 errors on API calls',
          'Discovered API requires Bearer prefix in Authorization header'
        )
      ).toBe(false);
    });

    it('passes meaningful session work with actual content', () => {
      expect(
        isGarbageExperience(
          'Session work: Auth module refactor',
          'Session work: Refactored auth module',
          'Migrated from sessions to JWT tokens, updated all middleware'
        )
      ).toBe(false);
    });

    it('passes error recovery with genuine insight', () => {
      expect(
        isGarbageExperience(
          'Fixed database connection',
          'Connection pool was exhausted',
          'Resolved by re-running with increased pool size from 5 to 20 connections'
        )
      ).toBe(false);
    });
  });
});
