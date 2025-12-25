import { describe, it, expect } from 'vitest';
import {
  isSafeRegexPattern,
  levenshteinDistance,
  fuzzyTextMatches,
  regexTextMatches,
  textMatches,
} from '../../src/services/query/text-matching.js';

describe('Query Text Matching', () => {
  describe('isSafeRegexPattern', () => {
    it('should accept simple patterns', () => {
      expect(isSafeRegexPattern('hello')).toBe(true);
      expect(isSafeRegexPattern('world.*test')).toBe(true);
      expect(isSafeRegexPattern('abc|def')).toBe(true);
      expect(isSafeRegexPattern('[a-z]+')).toBe(true);
    });

    it('should reject patterns that are too long', () => {
      const longPattern = 'a'.repeat(501);
      expect(isSafeRegexPattern(longPattern)).toBe(false);
    });

    it('should accept patterns at exactly max length', () => {
      const maxPattern = 'a'.repeat(500);
      expect(isSafeRegexPattern(maxPattern)).toBe(true);
    });

    it('should reject nested quantifiers (x+)+', () => {
      expect(isSafeRegexPattern('(a+)+')).toBe(false);
      expect(isSafeRegexPattern('(b*)*')).toBe(false);
      expect(isSafeRegexPattern('(c?)*')).toBe(false);
    });

    it('should reject quantified groups with trailing quantifier', () => {
      expect(isSafeRegexPattern('(a){2}+')).toBe(false);
      expect(isSafeRegexPattern('(b){1,3}*')).toBe(false);
    });

    it('should reject multiple consecutive quantifiers', () => {
      expect(isSafeRegexPattern('a+++')).toBe(false);
      expect(isSafeRegexPattern('b***')).toBe(false);
      expect(isSafeRegexPattern('c???')).toBe(false);
    });

    it('should reject character class with quantifier and brace', () => {
      expect(isSafeRegexPattern('[abc]+{')).toBe(false);
      expect(isSafeRegexPattern('[0-9]*{')).toBe(false);
    });

    it('should accept safe patterns with quantifiers', () => {
      expect(isSafeRegexPattern('a+')).toBe(true);
      expect(isSafeRegexPattern('b*')).toBe(true);
      expect(isSafeRegexPattern('c?')).toBe(true);
      expect(isSafeRegexPattern('d{2,5}')).toBe(true);
    });
  });

  describe('levenshteinDistance', () => {
    it('should return 0 for identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0);
      expect(levenshteinDistance('', '')).toBe(0);
      expect(levenshteinDistance('abc', 'abc')).toBe(0);
    });

    it('should calculate distance for insertions', () => {
      expect(levenshteinDistance('abc', 'abcd')).toBe(1);
      expect(levenshteinDistance('abc', 'abcde')).toBe(2);
    });

    it('should calculate distance for deletions', () => {
      expect(levenshteinDistance('abcd', 'abc')).toBe(1);
      expect(levenshteinDistance('abcde', 'abc')).toBe(2);
    });

    it('should calculate distance for substitutions', () => {
      expect(levenshteinDistance('abc', 'axc')).toBe(1);
      expect(levenshteinDistance('abc', 'xyz')).toBe(3);
    });

    it('should handle empty strings', () => {
      expect(levenshteinDistance('', 'abc')).toBe(3);
      expect(levenshteinDistance('abc', '')).toBe(3);
    });

    it('should optimize by swapping strings when first is longer', () => {
      // Should give same result regardless of order
      expect(levenshteinDistance('abc', 'abcdef')).toBe(3);
      expect(levenshteinDistance('abcdef', 'abc')).toBe(3);
    });

    describe('with maxDistance', () => {
      it('should return early if length difference exceeds maxDistance', () => {
        const result = levenshteinDistance('a', 'abcdefgh', 2);
        expect(result).toBeGreaterThan(2);
      });

      it('should return exact distance if within maxDistance', () => {
        expect(levenshteinDistance('abc', 'abd', 2)).toBe(1);
      });

      it('should return maxDistance + 1 when actual distance exceeds threshold', () => {
        const result = levenshteinDistance('abc', 'xyz', 1);
        expect(result).toBeGreaterThan(1);
      });

      it('should use early termination when row minimum exceeds maxDistance', () => {
        // This tests the early termination optimization
        const result = levenshteinDistance('hello', 'world', 1);
        expect(result).toBeGreaterThan(1);
      });
    });
  });

  describe('fuzzyTextMatches', () => {
    it('should return false for null/undefined haystack', () => {
      expect(fuzzyTextMatches(null, 'test')).toBe(false);
      expect(fuzzyTextMatches(undefined, 'test')).toBe(false);
    });

    it('should return true for exact substring match', () => {
      expect(fuzzyTextMatches('hello world', 'hello')).toBe(true);
      expect(fuzzyTextMatches('hello world', 'world')).toBe(true);
      expect(fuzzyTextMatches('hello world', 'lo wo')).toBe(true);
    });

    it('should be case-insensitive for substring match', () => {
      expect(fuzzyTextMatches('Hello World', 'hello')).toBe(true);
      expect(fuzzyTextMatches('hello world', 'WORLD')).toBe(true);
    });

    it('should return false for empty haystack', () => {
      // Empty haystack is falsy, returns false
      expect(fuzzyTextMatches('', '')).toBe(false);
    });

    it('should handle similar strings with fuzzy matching', () => {
      // Strings that are similar enough should match (distance <= 0.3 * maxLen)
      // 'hello' and 'helo' have distance 1, maxLen 5, threshold 1.5 -> match
      expect(fuzzyTextMatches('hello', 'helo')).toBe(true);
      // 'testing' and 'testng' have distance 1, maxLen 7, threshold 2.1 -> match
      expect(fuzzyTextMatches('testing', 'testng')).toBe(true);
    });

    it('should not match strings too different for threshold', () => {
      // 'test' and 'tset' have distance 2, maxLen 4, threshold 1.2 -> no match
      expect(fuzzyTextMatches('test', 'tset')).toBe(false);
    });

    it('should return false for very different strings', () => {
      expect(fuzzyTextMatches('abc', 'xyz')).toBe(false);
      expect(fuzzyTextMatches('hello', 'world')).toBe(false);
    });
  });

  describe('regexTextMatches', () => {
    it('should return false for null/undefined haystack', () => {
      expect(regexTextMatches(null, 'test')).toBe(false);
      expect(regexTextMatches(undefined, 'test')).toBe(false);
    });

    it('should match valid regex patterns', () => {
      expect(regexTextMatches('hello world', 'hello')).toBe(true);
      expect(regexTextMatches('hello world', 'h.llo')).toBe(true);
      expect(regexTextMatches('hello world', 'world$')).toBe(true);
      expect(regexTextMatches('hello world', '^hello')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(regexTextMatches('Hello World', 'hello')).toBe(true);
      expect(regexTextMatches('hello world', 'WORLD')).toBe(true);
    });

    it('should fall back to simple match for invalid regex', () => {
      // Invalid regex syntax - should fall back to string match
      expect(regexTextMatches('test[value', '[value')).toBe(true);
      expect(regexTextMatches('test(value', '(value')).toBe(true);
    });

    it('should reject and fall back for unsafe patterns', () => {
      // ReDoS pattern - should fall back to string match
      const unsafePattern = '(a+)+';
      expect(regexTextMatches('aaaaaa', unsafePattern)).toBe(false); // Falls back and won't match
    });

    it('should truncate very long haystacks for security', () => {
      const longHaystack = 'a'.repeat(15000) + 'test';
      // The match at position 15000 should not be found (truncated)
      expect(regexTextMatches(longHaystack, 'test$')).toBe(false);
    });

    it('should work with truncated haystack if match is at beginning', () => {
      const longHaystack = 'test' + 'a'.repeat(15000);
      expect(regexTextMatches(longHaystack, '^test')).toBe(true);
    });

    it('should handle character classes', () => {
      expect(regexTextMatches('abc123', '[a-z]+')).toBe(true);
      expect(regexTextMatches('ABC123', '[0-9]+')).toBe(true);
    });

    it('should handle alternation', () => {
      expect(regexTextMatches('hello', 'hello|world')).toBe(true);
      expect(regexTextMatches('world', 'hello|world')).toBe(true);
      expect(regexTextMatches('foo', 'hello|world')).toBe(false);
    });
  });

  describe('textMatches', () => {
    it('should return false for null/undefined haystack', () => {
      expect(textMatches(null, 'test')).toBe(false);
      expect(textMatches(undefined, 'test')).toBe(false);
    });

    it('should return true for exact substring match', () => {
      expect(textMatches('hello world', 'hello')).toBe(true);
      expect(textMatches('hello world', 'world')).toBe(true);
      expect(textMatches('hello world', 'lo wo')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(textMatches('Hello World', 'hello')).toBe(true);
      expect(textMatches('hello world', 'WORLD')).toBe(true);
      expect(textMatches('HELLO WORLD', 'lo wo')).toBe(true);
    });

    it('should return false for non-matching text', () => {
      expect(textMatches('hello world', 'xyz')).toBe(false);
      expect(textMatches('abc', 'def')).toBe(false);
    });

    it('should handle empty haystack', () => {
      // Empty string haystack returns false (falsy check)
      expect(textMatches('', 'hello')).toBe(false);
    });

    it('should handle empty needle', () => {
      // Empty needle is always a substring
      expect(textMatches('hello', '')).toBe(true);
    });

    it('should handle special characters', () => {
      expect(textMatches('hello.world', 'lo.wo')).toBe(true);
      expect(textMatches('hello$world', 'lo$wo')).toBe(true);
      expect(textMatches('hello[world', 'lo[wo')).toBe(true);
    });
  });
});
