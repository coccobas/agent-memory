import { describe, it, expect } from 'vitest';
import { extractSnippet } from '../../src/utils/snippet.js';

describe('Snippet Utility', () => {
  describe('extractSnippet', () => {
    it('should return empty string for null/undefined content', () => {
      expect(extractSnippet('')).toBe('');
      expect(extractSnippet(null)).toBe('');
      expect(extractSnippet(undefined)).toBe('');
    });

    it('should return content as-is if within maxLength', () => {
      const shortContent = 'This is a short sentence.';
      expect(extractSnippet(shortContent)).toBe(shortContent);
    });

    it('should normalize whitespace', () => {
      const content = 'This   has\n\tmultiple   spaces.';
      expect(extractSnippet(content)).toBe('This has multiple spaces.');
    });

    it('should break at sentence boundary when possible', () => {
      const content =
        'First sentence. Second sentence. Third sentence that is very long and would exceed the limit.';
      const result = extractSnippet(content, 50);
      expect(result).toBe('First sentence. Second sentence.');
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it('should truncate at word boundary with ellipsis when no sentence break', () => {
      const content =
        'This is a very long sentence without any period that goes on and on and on and on and on and on';
      const result = extractSnippet(content, 50);
      expect(result).toContain('...');
      expect(result.length).toBeLessThanOrEqual(53); // 50 + '...'
    });

    it('should handle content exactly at maxLength', () => {
      const content = 'A'.repeat(150);
      const result = extractSnippet(content, 150);
      expect(result).toBe(content);
    });

    it('should handle custom maxLength', () => {
      const content = 'Short text. Another sentence. And more.';
      const result = extractSnippet(content, 20);
      expect(result.length).toBeLessThanOrEqual(23); // 20 + '...'
    });
  });
});
