import { describe, it, expect } from 'vitest';
import {
  ConfidenceBooster,
  createConfidenceBooster,
  boostExtractionConfidence,
  DEFAULT_BOOST_PATTERNS,
  type ExtractedEntry,
} from '../../../src/services/extraction/confidence-booster.js';

describe('ConfidenceBooster', () => {
  describe('analyzeContext', () => {
    it('should detect decision patterns with "instead of"', () => {
      const booster = createConfidenceBooster();
      const matches = booster.analyzeContext(
        'instead of using a 12v motor tests suggest a 24v one performs much better'
      );

      const patternNames = matches.map((m) => m.pattern.name);
      expect(patternNames).toContain('decision-instead');
      expect(patternNames).toContain('evidence-tests');
      expect(patternNames).toContain('comparison-performance');
    });

    it('should detect explicit decision patterns', () => {
      const booster = createConfidenceBooster();
      const matches = booster.analyzeContext('we decided to use PostgreSQL for the database');

      expect(matches.some((m) => m.pattern.name === 'decision-explicit')).toBe(true);
    });

    it('should detect rule patterns', () => {
      const booster = createConfidenceBooster();
      const matches = booster.analyzeContext('always use TypeScript strict mode');

      expect(matches.some((m) => m.pattern.name === 'rule-imperative')).toBe(true);
    });

    it('should detect preference with reason', () => {
      const booster = createConfidenceBooster();
      const matches = booster.analyzeContext('we prefer Redis because it has better performance');

      expect(matches.some((m) => m.pattern.name === 'preference-with-reason')).toBe(true);
    });

    it('should return empty array for neutral content', () => {
      const booster = createConfidenceBooster();
      const matches = booster.analyzeContext('the sky is blue');

      expect(matches).toHaveLength(0);
    });
  });

  describe('boostEntry', () => {
    it('should boost knowledge entry confidence for decision patterns', () => {
      const booster = createConfidenceBooster();
      const entry: ExtractedEntry = {
        type: 'knowledge',
        title: 'Motor voltage preference',
        content: '24V motor performs better',
        confidence: 0.5,
      };

      const result = booster.boostEntry(
        entry,
        'instead of using a 12v motor tests suggest a 24v one performs much better'
      );

      expect(result.boostedConfidence).toBeGreaterThan(0.5);
      expect(result.boostedConfidence).toBeGreaterThanOrEqual(0.75);
      expect(result.matchedPatterns.length).toBeGreaterThan(0);
    });

    it('should not boost beyond maxConfidence', () => {
      const booster = createConfidenceBooster();
      const entry: ExtractedEntry = {
        type: 'knowledge',
        title: 'Test',
        content: 'Test content',
        confidence: 0.85,
      };

      const result = booster.boostEntry(
        entry,
        'we decided to use X instead of Y because tests show it performs better'
      );

      expect(result.boostedConfidence).toBeLessThanOrEqual(0.95);
    });

    it('should not boost guideline for knowledge-only patterns', () => {
      const booster = createConfidenceBooster();
      const entry: ExtractedEntry = {
        type: 'guideline',
        name: 'test-rule',
        content: 'Test rule',
        confidence: 0.5,
      };

      const result = booster.boostEntry(entry, 'tests suggest X performs better');

      expect(result.boostedConfidence).toBe(0.5);
      expect(result.matchedPatterns).toHaveLength(0);
    });

    it('should boost guideline for rule patterns', () => {
      const booster = createConfidenceBooster();
      const entry: ExtractedEntry = {
        type: 'guideline',
        name: 'strict-mode',
        content: 'Use TypeScript strict mode',
        confidence: 0.5,
      };

      const result = booster.boostEntry(entry, 'always use TypeScript strict mode');

      expect(result.boostedConfidence).toBeGreaterThan(0.5);
      expect(result.matchedPatterns.some((p) => p.includes('rule-imperative'))).toBe(true);
    });

    it('should apply diminishing returns for multiple patterns', () => {
      const booster = createConfidenceBooster();
      const entry: ExtractedEntry = {
        type: 'knowledge',
        title: 'Complex decision',
        content: 'Decision with multiple signals',
        confidence: 0.4,
      };

      const result = booster.boostEntry(
        entry,
        'we decided to use X instead of Y because tests show it performs much better'
      );

      expect(result.matchedPatterns.length).toBeGreaterThan(2);
      expect(result.boostedConfidence).toBeLessThan(0.4 + result.totalBoost * 1.5);
    });
  });

  describe('boostEntries', () => {
    it('should boost all entries in array', () => {
      const booster = createConfidenceBooster();
      const entries: ExtractedEntry[] = [
        { type: 'knowledge', title: 'Entry 1', content: 'Content 1', confidence: 0.5 },
        { type: 'knowledge', title: 'Entry 2', content: 'Content 2', confidence: 0.6 },
      ];

      const boosted = booster.boostEntries(entries, 'instead of X, we decided to use Y');

      expect(boosted[0].confidence).toBeGreaterThan(0.5);
      expect(boosted[1].confidence).toBeGreaterThan(0.6);
    });
  });

  describe('boostExtractionConfidence (convenience function)', () => {
    it('should work with default booster', () => {
      const entries: ExtractedEntry[] = [
        {
          type: 'knowledge',
          title: 'Prefer 24V motor',
          content: 'Using a 24V motor yields better performance',
          confidence: 0.5,
        },
      ];

      const boosted = boostExtractionConfidence(
        entries,
        'instead of using a 12v motor tests suggest a 24v one performs much better'
      );

      expect(boosted[0].confidence).toBeGreaterThanOrEqual(0.75);
    });
  });

  describe('custom patterns', () => {
    it('should support custom boost patterns', () => {
      const customPatterns = [
        {
          name: 'motor-voltage',
          patterns: [/\b24v\b/i, /\b12v\b/i],
          boost: 0.4,
          maxConfidence: 0.95,
          appliesTo: ['knowledge' as const],
        },
      ];

      const booster = createConfidenceBooster(customPatterns);
      const entry: ExtractedEntry = {
        type: 'knowledge',
        title: 'Motor choice',
        content: '24V motor',
        confidence: 0.5,
      };

      const result = booster.boostEntry(entry, 'use a 24v motor');

      expect(result.boostedConfidence).toBe(0.9);
      expect(result.matchedPatterns).toContain('motor-voltage: "24v"');
    });
  });

  describe('DEFAULT_BOOST_PATTERNS', () => {
    it('should have patterns for all major categories', () => {
      const categories = DEFAULT_BOOST_PATTERNS.map((p) => p.name.split('-')[0]);
      const uniqueCategories = [...new Set(categories)];

      expect(uniqueCategories).toContain('decision');
      expect(uniqueCategories).toContain('evidence');
      expect(uniqueCategories).toContain('comparison');
      expect(uniqueCategories).toContain('rule');
      expect(uniqueCategories).toContain('preference');
    });

    it('should have reasonable boost values', () => {
      for (const pattern of DEFAULT_BOOST_PATTERNS) {
        expect(pattern.boost).toBeGreaterThan(0);
        expect(pattern.boost).toBeLessThanOrEqual(0.4);
        if (pattern.maxConfidence) {
          expect(pattern.maxConfidence).toBeGreaterThanOrEqual(0.8);
          expect(pattern.maxConfidence).toBeLessThanOrEqual(1);
        }
      }
    });
  });
});
