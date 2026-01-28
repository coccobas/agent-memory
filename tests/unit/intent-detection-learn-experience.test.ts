import { describe, it, expect } from 'vitest';
import { detectIntent } from '../../src/services/intent-detection/patterns.js';

/**
 * TDD Tests for "learn experience:" pattern detection
 *
 * These tests are written FIRST (RED phase) before implementation.
 * They should FAIL initially until the learn_experience intent is implemented.
 *
 * Bug context: User tried "learn experience: Fixed todowrite error..." which
 * mixed structured syntax (memory_experience `learn` action) with natural
 * language interface (memory tool). This exposed the need for a dedicated
 * intent pattern.
 */
describe('Intent Detection - learn_experience Pattern', () => {
  describe('basic pattern detection', () => {
    it('should detect "learn experience:" pattern', () => {
      const result = detectIntent('learn experience: Fixed the authentication bug');
      expect(result.intent).toBe('learn_experience');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should extract text after colon as content', () => {
      const result = detectIntent('learn experience: Fixed the authentication bug');
      expect(result.extractedParams.text).toBe('Fixed the authentication bug');
    });

    it('should handle multiple words after colon', () => {
      const result = detectIntent(
        'learn experience: Discovered that the API returns 404 for empty arrays'
      );
      expect(result.intent).toBe('learn_experience');
      expect(result.extractedParams.text).toBe(
        'Discovered that the API returns 404 for empty arrays'
      );
    });
  });

  describe('case insensitivity', () => {
    it('should detect "LEARN EXPERIENCE:" (uppercase)', () => {
      const result = detectIntent('LEARN EXPERIENCE: Fixed the bug');
      expect(result.intent).toBe('learn_experience');
    });

    it('should detect "Learn Experience:" (title case)', () => {
      const result = detectIntent('Learn Experience: Fixed the bug');
      expect(result.intent).toBe('learn_experience');
    });

    it('should detect "LeArN eXpErIeNcE:" (mixed case)', () => {
      const result = detectIntent('LeArN eXpErIeNcE: Fixed the bug');
      expect(result.intent).toBe('learn_experience');
    });
  });

  describe('whitespace handling', () => {
    it('should handle extra spaces between words', () => {
      const result = detectIntent('learn   experience:  Fixed the bug');
      expect(result.intent).toBe('learn_experience');
      expect(result.extractedParams.text).toBe('Fixed the bug');
    });

    it('should handle leading whitespace', () => {
      const result = detectIntent('  learn experience: Fixed the bug');
      expect(result.intent).toBe('learn_experience');
    });

    it('should handle trailing whitespace in content', () => {
      const result = detectIntent('learn experience: Fixed the bug  ');
      expect(result.extractedParams.text).toBe('Fixed the bug');
    });

    it('should handle no space after colon', () => {
      const result = detectIntent('learn experience:Fixed the bug');
      expect(result.intent).toBe('learn_experience');
      expect(result.extractedParams.text).toBe('Fixed the bug');
    });
  });

  describe('empty content handling', () => {
    it('should handle empty content after colon with low confidence or error flag', () => {
      const result = detectIntent('learn experience: ');
      // Either low confidence or error flag indicates invalid input
      expect(
        result.confidence < 0.5 ||
          result.extractedParams.error !== undefined ||
          result.intent === 'unknown'
      ).toBe(true);
    });

    it('should handle only colon with no content', () => {
      const result = detectIntent('learn experience:');
      expect(
        result.confidence < 0.5 ||
          result.extractedParams.error !== undefined ||
          result.intent === 'unknown'
      ).toBe(true);
    });
  });

  describe('negation handling', () => {
    it('should NOT detect "don\'t learn experience:" as learn_experience', () => {
      const result = detectIntent("don't learn experience: something");
      expect(result.intent).not.toBe('learn_experience');
    });

    it('should NOT detect "do not learn experience:" as learn_experience', () => {
      const result = detectIntent('do not learn experience: something');
      expect(result.intent).not.toBe('learn_experience');
    });

    it('should NOT detect "never learn experience:" as learn_experience', () => {
      const result = detectIntent('never learn experience: something');
      expect(result.intent).not.toBe('learn_experience');
    });
  });

  describe('similar but different patterns', () => {
    it('should NOT detect "learn from experience" (no colon)', () => {
      const result = detectIntent('learn from experience about debugging');
      expect(result.intent).not.toBe('learn_experience');
    });

    it('should NOT detect "learning experience" (different word)', () => {
      const result = detectIntent('learning experience: something');
      expect(result.intent).not.toBe('learn_experience');
    });

    it('should NOT detect "learn experiences" (plural)', () => {
      const result = detectIntent('learn experiences: something');
      expect(result.intent).not.toBe('learn_experience');
    });
  });

  describe('integration with existing intents', () => {
    it('should not conflict with store intent', () => {
      // "remember that" should still be store, not learn_experience
      const result = detectIntent('remember that we use TypeScript');
      expect(result.intent).toBe('store');
    });

    it('should not conflict with retrieve intent', () => {
      // "what do we know about" should still be retrieve
      const result = detectIntent('what do we know about authentication?');
      expect(result.intent).toBe('retrieve');
    });

    it('should have higher specificity than generic patterns', () => {
      // "learn experience:" is more specific than any generic "learn" pattern
      const result = detectIntent('learn experience: Fixed the bug');
      expect(result.intent).toBe('learn_experience');
      // Should not fall through to store or other intents
    });
  });
});

/**
 * Tests for PolicyType centralization
 *
 * These tests verify that PolicyType is properly centralized
 * and can be imported from a single source of truth.
 */
describe('PolicyType Centralization', () => {
  it('should export POLICY_TYPES constant array', async () => {
    // This will fail until policy-types.ts is created
    const { POLICY_TYPES } = await import('../../src/services/rl/policy-types.js');
    expect(POLICY_TYPES).toEqual(['extraction', 'retrieval', 'consolidation']);
  });

  it('should export PolicyType type', async () => {
    // This will fail until policy-types.ts is created
    const { isPolicyType } = await import('../../src/services/rl/policy-types.js');
    expect(isPolicyType('extraction')).toBe(true);
    expect(isPolicyType('retrieval')).toBe(true);
    expect(isPolicyType('consolidation')).toBe(true);
    expect(isPolicyType('invalid')).toBe(false);
  });

  it('should provide type guard function', async () => {
    const { isPolicyType } = await import('../../src/services/rl/policy-types.js');
    expect(typeof isPolicyType).toBe('function');
  });
});
