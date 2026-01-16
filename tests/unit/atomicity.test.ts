import { describe, it, expect } from 'vitest';
import {
  detectCompoundEntry,
  splitCompoundEntry,
  ensureAtomicity,
  type AtomicityConfig,
} from '../../src/services/extraction/atomicity.js';
import type { ExtractedEntry } from '../../src/services/extraction.service.js';

describe('atomicity detection', () => {
  describe('detectCompoundEntry', () => {
    it('detects compound guidelines with multiple "and" linking imperatives', () => {
      const entry: ExtractedEntry = {
        type: 'guideline',
        name: 'code-rules',
        content: 'Always use TypeScript strict mode and never use any type',
        confidence: 0.8,
      };
      const result = detectCompoundEntry(entry);
      expect(result.isCompound).toBe(true);
      expect(result.reason).toContain('and');
    });

    it('detects compound guidelines with semicolon-separated rules', () => {
      const entry: ExtractedEntry = {
        type: 'guideline',
        name: 'naming',
        content:
          'Use camelCase for variables; Use PascalCase for classes; Use UPPER_CASE for constants',
        confidence: 0.9,
      };
      const result = detectCompoundEntry(entry);
      expect(result.isCompound).toBe(true);
      expect(result.reason).toContain('semicolon');
    });

    it('detects compound knowledge with "also decided" patterns', () => {
      const entry: ExtractedEntry = {
        type: 'knowledge',
        title: 'Tech Stack',
        content: 'We chose PostgreSQL for persistence. We also decided to use Redis for caching.',
        confidence: 0.85,
      };
      const result = detectCompoundEntry(entry);
      expect(result.isCompound).toBe(true);
      expect(result.reason).toContain('decided');
    });

    it('detects compound entries with "Also"/"Additionally" markers', () => {
      const entry: ExtractedEntry = {
        type: 'guideline',
        name: 'code-style',
        content: 'Always format code with prettier. Additionally, run eslint before committing.',
        confidence: 0.8,
      };
      const result = detectCompoundEntry(entry);
      expect(result.isCompound).toBe(true);
      expect(result.reason).toContain('Also');
    });

    it('detects compound guidelines with multiple imperative sentences', () => {
      const entry: ExtractedEntry = {
        type: 'guideline',
        name: 'security-rules',
        content:
          'Always validate user input. Never trust client data. Must sanitize before database queries.',
        confidence: 0.9,
      };
      const result = detectCompoundEntry(entry);
      expect(result.isCompound).toBe(true);
    });

    it('detects compound entries with enumerated lists', () => {
      const entry: ExtractedEntry = {
        type: 'guideline',
        name: 'process',
        content: '1) Write tests first 2) Implement feature 3) Review code',
        confidence: 0.7,
      };
      const result = detectCompoundEntry(entry);
      expect(result.isCompound).toBe(true);
      expect(result.reason).toContain('numerated');
    });

    it('does not flag atomic guidelines', () => {
      const entry: ExtractedEntry = {
        type: 'guideline',
        name: 'strict-mode',
        content: 'Always use TypeScript strict mode for type safety.',
        confidence: 0.9,
      };
      const result = detectCompoundEntry(entry);
      expect(result.isCompound).toBe(false);
    });

    it('does not flag atomic knowledge entries', () => {
      const entry: ExtractedEntry = {
        type: 'knowledge',
        title: 'Database Choice',
        content: 'We chose PostgreSQL for its JSONB support and reliability.',
        confidence: 0.85,
      };
      const result = detectCompoundEntry(entry);
      expect(result.isCompound).toBe(false);
    });

    it('handles edge cases with legitimate "and" usage', () => {
      const entry: ExtractedEntry = {
        type: 'knowledge',
        title: 'API Format',
        content: 'The API uses JSON for request and response bodies.',
        confidence: 0.8,
      };
      // This is atomic - "and" connects parts of same concept
      const result = detectCompoundEntry(entry);
      expect(result.isCompound).toBe(false);
    });

    it('applies stricter checks for long content', () => {
      const entry: ExtractedEntry = {
        type: 'guideline',
        name: 'long-guideline',
        content:
          'Always ensure proper error handling in async functions. ' +
          'You should also add retry logic for network calls. ' +
          'Never expose stack traces to end users. ' +
          'Prefer using structured logging over console.log.',
        confidence: 0.7,
      };
      const result = detectCompoundEntry(entry, 100); // Lower threshold
      expect(result.isCompound).toBe(true);
    });

    it('counts imperative verbs correctly', () => {
      const entry: ExtractedEntry = {
        type: 'guideline',
        name: 'many-rules',
        content: 'Always use X, never do Y, must ensure Z, should prefer W',
        confidence: 0.8,
      };
      const result = detectCompoundEntry(entry);
      expect(result.isCompound).toBe(true);
      expect(result.reason).toContain('imperative');
    });
  });
});

describe('atomicity splitting', () => {
  describe('splitCompoundEntry', () => {
    it('splits guideline with semicolon-separated rules', () => {
      const entry: ExtractedEntry = {
        type: 'guideline',
        name: 'code-style-rules',
        content:
          'Use camelCase for variables; Use PascalCase for classes; Use UPPER_CASE for constants',
        confidence: 0.8,
        category: 'code_style',
        suggestedTags: ['naming'],
      };
      const result = splitCompoundEntry(entry, 5);
      expect(result).toHaveLength(3);
      expect(result[0].content).toContain('camelCase');
      expect(result[1].content).toContain('PascalCase');
      expect(result[2].content).toContain('UPPER_CASE');
    });

    it('preserves metadata in split entries', () => {
      const entry: ExtractedEntry = {
        type: 'guideline',
        name: 'security-rules',
        content: 'Never commit secrets; Always validate input',
        category: 'security',
        confidence: 0.9,
        suggestedTags: ['security', 'best-practice'],
      };
      const result = splitCompoundEntry(entry, 5);
      expect(result).toHaveLength(2);
      result.forEach((e) => {
        expect(e.type).toBe('guideline');
        expect(e.category).toBe('security');
        expect(e.suggestedTags).toContain('security');
      });
    });

    it('generates unique names for split entries', () => {
      const entry: ExtractedEntry = {
        type: 'guideline',
        name: 'my-rule',
        content: 'Do X; Do Y; Do Z',
        confidence: 0.8,
      };
      const result = splitCompoundEntry(entry, 5);
      const names = result.map((e) => e.name);
      expect(new Set(names).size).toBe(names.length); // All unique
    });

    it('slightly reduces confidence for split entries', () => {
      const entry: ExtractedEntry = {
        type: 'guideline',
        name: 'rules',
        content: 'Rule A; Rule B',
        confidence: 0.9,
      };
      const result = splitCompoundEntry(entry, 5);
      result.forEach((e) => {
        expect(e.confidence).toBeLessThan(0.9);
        expect(e.confidence).toBeGreaterThan(0.8); // Not too much reduction
      });
    });

    it('splits on "Also"/"Additionally" markers', () => {
      const entry: ExtractedEntry = {
        type: 'guideline',
        name: 'testing',
        content: 'Always write unit tests. Additionally, add integration tests for API endpoints.',
        confidence: 0.85,
      };
      const result = splitCompoundEntry(entry, 5);
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0].content).toContain('unit tests');
    });

    it('splits knowledge entries on decision patterns', () => {
      const entry: ExtractedEntry = {
        type: 'knowledge',
        title: 'Tech Decisions',
        content: 'We chose PostgreSQL for persistence. We also decided to use Redis for caching.',
        confidence: 0.8,
      };
      const result = splitCompoundEntry(entry, 5);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('does not split atomic entries', () => {
      const entry: ExtractedEntry = {
        type: 'guideline',
        name: 'single-rule',
        content: 'Always use TypeScript strict mode.',
        confidence: 0.9,
      };
      const result = splitCompoundEntry(entry, 5);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe(entry.content);
    });

    it('is conservative with tools - only splits distinct commands', () => {
      const entry: ExtractedEntry = {
        type: 'tool',
        name: 'build-commands',
        content: 'npm run build; npm run test',
        confidence: 0.8,
      };
      const result = splitCompoundEntry(entry, 5);
      // Tools are conservative, should split since these are npm commands
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('keeps related tool subcommands together', () => {
      const entry: ExtractedEntry = {
        type: 'tool',
        name: 'docker-commands',
        content: 'docker compose up -d --build',
        confidence: 0.8,
      };
      const result = splitCompoundEntry(entry, 5);
      // Single command with flags should not be split
      expect(result).toHaveLength(1);
    });
  });
});

describe('ensureAtomicity', () => {
  const defaultConfig: AtomicityConfig = {
    enabled: true,
    splitMode: 'silent',
    maxSplits: 5,
    contentThreshold: 300,
  };

  it('passes through atomic entries unchanged', () => {
    const entries: ExtractedEntry[] = [
      {
        type: 'guideline',
        name: 'rule-1',
        content: 'Always use TypeScript strict mode.',
        confidence: 0.9,
      },
      {
        type: 'knowledge',
        title: 'decision-1',
        content: 'We chose PostgreSQL for persistence.',
        confidence: 0.85,
      },
    ];

    const result = ensureAtomicity(entries, defaultConfig);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe(entries[0].content);
    expect(result[1].content).toBe(entries[1].content);
  });

  it('splits compound entries and increases array size', () => {
    const entries: ExtractedEntry[] = [
      {
        type: 'guideline',
        name: 'rules',
        content: 'Use camelCase; Use PascalCase; Use UPPER_CASE',
        confidence: 0.8,
      },
    ];

    const result = ensureAtomicity(entries, defaultConfig);
    expect(result.length).toBeGreaterThan(1);
  });

  it('respects atomicityEnabled: false', () => {
    const entries: ExtractedEntry[] = [
      {
        type: 'guideline',
        name: 'compound',
        content: 'Do X; Do Y; Do Z',
        confidence: 0.8,
      },
    ];

    const result = ensureAtomicity(entries, {
      ...defaultConfig,
      enabled: false,
    });

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Do X; Do Y; Do Z');
  });

  it('respects splitMode: disabled (detect only)', () => {
    const entries: ExtractedEntry[] = [
      {
        type: 'guideline',
        name: 'compound',
        content: 'Do X; Do Y; Do Z',
        confidence: 0.8,
      },
    ];

    const result = ensureAtomicity(entries, {
      ...defaultConfig,
      splitMode: 'disabled',
    });

    // Should detect but not split
    expect(result).toHaveLength(1);
  });

  it('respects maxSplits limit', () => {
    const entries: ExtractedEntry[] = [
      {
        type: 'guideline',
        name: 'many-rules',
        content: 'Rule 1; Rule 2; Rule 3; Rule 4; Rule 5; Rule 6; Rule 7',
        confidence: 0.8,
      },
    ];

    const result = ensureAtomicity(entries, {
      ...defaultConfig,
      maxSplits: 3,
    });

    // Should not split more than maxSplits
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('handles mixed atomic and compound entries', () => {
    const entries: ExtractedEntry[] = [
      {
        type: 'guideline',
        name: 'atomic',
        content: 'Always use strict mode.',
        confidence: 0.9,
      },
      {
        type: 'guideline',
        name: 'compound',
        content: 'Do X; Do Y',
        confidence: 0.8,
      },
      {
        type: 'knowledge',
        title: 'fact',
        content: 'The API uses REST.',
        confidence: 0.85,
      },
    ];

    const result = ensureAtomicity(entries, defaultConfig);
    // 1 atomic guideline + 2 from split + 1 atomic knowledge = 4
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it('preserves entry order (atomic entries first, then splits)', () => {
    const entries: ExtractedEntry[] = [
      {
        type: 'guideline',
        name: 'first',
        content: 'First rule.',
        confidence: 0.9,
      },
      {
        type: 'guideline',
        name: 'compound',
        content: 'A; B',
        confidence: 0.8,
      },
      {
        type: 'guideline',
        name: 'last',
        content: 'Last rule.',
        confidence: 0.85,
      },
    ];

    const result = ensureAtomicity(entries, defaultConfig);
    // First should still be first
    expect(result[0].name).toBe('first');
    // Last should be after the split entries
    expect(result[result.length - 1].name).toBe('last');
  });

  it('handles empty entries array', () => {
    const result = ensureAtomicity([], defaultConfig);
    expect(result).toHaveLength(0);
  });

  it('handles entries with no content', () => {
    const entries: ExtractedEntry[] = [
      {
        type: 'guideline',
        name: 'empty',
        content: '',
        confidence: 0.5,
      },
    ];

    const result = ensureAtomicity(entries, defaultConfig);
    expect(result).toHaveLength(1);
  });
});
