import { describe, it, expect } from 'vitest';
import { parseExclusions, containsExclusion } from '../../src/services/query/exclusion-parser.js';
import type { ExclusionParseResult, ParsedExclusion } from '../../src/services/query/types.js';

describe('parseExclusions', () => {
  describe('single word exclusions', () => {
    it('should parse -term as single word exclusion', () => {
      const result = parseExclusions('authentication -password');

      expect(result.cleanedQuery).toBe('authentication');
      expect(result.exclusions).toHaveLength(1);
      expect(result.exclusions[0]).toEqual({ term: 'password', isPhrase: false });
    });

    it('should parse multiple single word exclusions', () => {
      const result = parseExclusions('database -mysql -postgres');

      expect(result.cleanedQuery).toBe('database');
      expect(result.exclusions).toHaveLength(2);
      expect(result.exclusions[0]).toEqual({ term: 'mysql', isPhrase: false });
      expect(result.exclusions[1]).toEqual({ term: 'postgres', isPhrase: false });
    });

    it('should handle exclusion at beginning of query', () => {
      const result = parseExclusions('-deprecated api endpoints');

      expect(result.cleanedQuery).toBe('api endpoints');
      expect(result.exclusions).toHaveLength(1);
      expect(result.exclusions[0]).toEqual({ term: 'deprecated', isPhrase: false });
    });

    it('should handle only exclusions (no positive query)', () => {
      const result = parseExclusions('-foo -bar');

      expect(result.cleanedQuery).toBe('');
      expect(result.exclusions).toHaveLength(2);
    });
  });

  describe('phrase exclusions', () => {
    it('should parse -"multi word phrase" as phrase exclusion', () => {
      const result = parseExclusions('api -"deprecated endpoint"');

      expect(result.cleanedQuery).toBe('api');
      expect(result.exclusions).toHaveLength(1);
      expect(result.exclusions[0]).toEqual({ term: 'deprecated endpoint', isPhrase: true });
    });

    it('should handle multiple phrase exclusions', () => {
      const result = parseExclusions('config -"test data" -"mock server"');

      expect(result.cleanedQuery).toBe('config');
      expect(result.exclusions).toHaveLength(2);
      expect(result.exclusions[0]).toEqual({ term: 'test data', isPhrase: true });
      expect(result.exclusions[1]).toEqual({ term: 'mock server', isPhrase: true });
    });

    it('should handle single quotes for phrases', () => {
      const result = parseExclusions("config -'test data'");

      expect(result.cleanedQuery).toBe('config');
      expect(result.exclusions).toHaveLength(1);
      expect(result.exclusions[0]).toEqual({ term: 'test data', isPhrase: true });
    });
  });

  describe('mixed exclusions', () => {
    it('should handle both single word and phrase exclusions', () => {
      const result = parseExclusions('setup -legacy -"old version" config');

      expect(result.cleanedQuery).toBe('setup config');
      expect(result.exclusions).toHaveLength(2);
      expect(result.exclusions).toContainEqual({ term: 'legacy', isPhrase: false });
      expect(result.exclusions).toContainEqual({ term: 'old version', isPhrase: true });
    });
  });

  describe('edge cases', () => {
    it('should return original query when no exclusions present', () => {
      const result = parseExclusions('simple query without exclusions');

      expect(result.cleanedQuery).toBe('simple query without exclusions');
      expect(result.exclusions).toHaveLength(0);
    });

    it('should handle empty query', () => {
      const result = parseExclusions('');

      expect(result.cleanedQuery).toBe('');
      expect(result.exclusions).toHaveLength(0);
    });

    it('should handle query with only whitespace', () => {
      const result = parseExclusions('   ');

      expect(result.cleanedQuery).toBe('');
      expect(result.exclusions).toHaveLength(0);
    });

    it('should not treat hyphenated words as exclusions', () => {
      const result = parseExclusions('well-known api');

      expect(result.cleanedQuery).toBe('well-known api');
      expect(result.exclusions).toHaveLength(0);
    });

    it('should handle hyphen in middle of word correctly', () => {
      const result = parseExclusions('user-friendly interface -deprecated');

      expect(result.cleanedQuery).toBe('user-friendly interface');
      expect(result.exclusions).toHaveLength(1);
      expect(result.exclusions[0]).toEqual({ term: 'deprecated', isPhrase: false });
    });

    it('should trim whitespace from cleaned query', () => {
      const result = parseExclusions('  query  -term  ');

      expect(result.cleanedQuery).toBe('query');
      expect(result.exclusions).toHaveLength(1);
    });

    it('should handle unclosed quote gracefully', () => {
      const result = parseExclusions('api -"unclosed phrase');

      expect(result.cleanedQuery).toBe('api');
      expect(result.exclusions).toHaveLength(1);
      expect(result.exclusions[0]).toEqual({ term: 'unclosed phrase', isPhrase: true });
    });

    it('should handle empty exclusion term', () => {
      const result = parseExclusions('query - something');

      expect(result.cleanedQuery).toBe('query something');
      expect(result.exclusions).toHaveLength(0);
    });

    it('should handle empty phrase exclusion', () => {
      const result = parseExclusions('query -"" something');

      expect(result.cleanedQuery).toBe('query something');
      expect(result.exclusions).toHaveLength(0);
    });
  });

  describe('special characters', () => {
    it('should preserve special characters in exclusion terms', () => {
      const result = parseExclusions('config -v2.0');

      expect(result.cleanedQuery).toBe('config');
      expect(result.exclusions).toHaveLength(1);
      expect(result.exclusions[0]).toEqual({ term: 'v2.0', isPhrase: false });
    });

    it('should handle unicode in exclusion terms', () => {
      const result = parseExclusions('search -テスト');

      expect(result.cleanedQuery).toBe('search');
      expect(result.exclusions).toHaveLength(1);
      expect(result.exclusions[0]).toEqual({ term: 'テスト', isPhrase: false });
    });
  });

  describe('normalization', () => {
    it('should normalize multiple spaces in cleaned query', () => {
      const result = parseExclusions('foo   -bar   baz');

      expect(result.cleanedQuery).toBe('foo baz');
    });

    it('should lowercase exclusion terms for case-insensitive matching', () => {
      const result = parseExclusions('API -DEPRECATED -"Old Version"');

      expect(result.cleanedQuery).toBe('API');
      expect(result.exclusions[0].term).toBe('deprecated');
      expect(result.exclusions[1].term).toBe('old version');
    });
  });
});

describe('containsExclusion', () => {
  describe('single word exclusions', () => {
    it('should return true when text contains excluded word', () => {
      const exclusions: ParsedExclusion[] = [{ term: 'deprecated', isPhrase: false }];

      expect(containsExclusion('This API is deprecated', exclusions)).toBe(true);
    });

    it('should return false when text does not contain excluded word', () => {
      const exclusions: ParsedExclusion[] = [{ term: 'deprecated', isPhrase: false }];

      expect(containsExclusion('This API is current', exclusions)).toBe(false);
    });

    it('should match case-insensitively', () => {
      const exclusions: ParsedExclusion[] = [{ term: 'deprecated', isPhrase: false }];

      expect(containsExclusion('This is DEPRECATED', exclusions)).toBe(true);
    });

    it('should respect word boundaries', () => {
      const exclusions: ParsedExclusion[] = [{ term: 'test', isPhrase: false }];

      expect(containsExclusion('This is a test case', exclusions)).toBe(true);
      expect(containsExclusion('This is a testing scenario', exclusions)).toBe(false);
      expect(containsExclusion('contest results', exclusions)).toBe(false);
    });

    it('should handle multiple exclusions (OR logic)', () => {
      const exclusions: ParsedExclusion[] = [
        { term: 'deprecated', isPhrase: false },
        { term: 'legacy', isPhrase: false },
      ];

      expect(containsExclusion('This is deprecated', exclusions)).toBe(true);
      expect(containsExclusion('This is legacy code', exclusions)).toBe(true);
      expect(containsExclusion('This is current code', exclusions)).toBe(false);
    });
  });

  describe('phrase exclusions', () => {
    it('should return true when text contains excluded phrase', () => {
      const exclusions: ParsedExclusion[] = [{ term: 'old version', isPhrase: true }];

      expect(containsExclusion('This is the old version of the API', exclusions)).toBe(true);
    });

    it('should return false when phrase words appear but not together', () => {
      const exclusions: ParsedExclusion[] = [{ term: 'old version', isPhrase: true }];

      expect(containsExclusion('This is an old API, version 2', exclusions)).toBe(false);
    });

    it('should match phrase case-insensitively', () => {
      const exclusions: ParsedExclusion[] = [{ term: 'test data', isPhrase: true }];

      expect(containsExclusion('This contains TEST DATA here', exclusions)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should return false when exclusions array is empty', () => {
      expect(containsExclusion('Any text here', [])).toBe(false);
    });

    it('should handle empty text', () => {
      const exclusions: ParsedExclusion[] = [{ term: 'test', isPhrase: false }];

      expect(containsExclusion('', exclusions)).toBe(false);
    });

    it('should handle special regex characters in exclusion terms', () => {
      const exclusions: ParsedExclusion[] = [{ term: 'v2.0', isPhrase: false }];

      expect(containsExclusion('This is version v2.0', exclusions)).toBe(true);
      expect(containsExclusion('This is version v2x0', exclusions)).toBe(false);
    });
  });
});
