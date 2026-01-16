import { describe, it, expect } from 'vitest';
import {
  extractSnippet,
  getItemTitle,
  getItemContent,
  getItemCategory,
  getItemCreatedAt,
} from '../../src/utils/snippet.js';
import type { QueryResultItem } from '../../src/services/query/pipeline.js';

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

    it('should handle content with no spaces when truncating', () => {
      const content = 'A'.repeat(200);
      const result = extractSnippet(content, 50);
      expect(result).toBe('A'.repeat(50) + '...');
    });

    it('should not break at space if too early in string', () => {
      // Space at 30% position shouldn't be used (needs to be > 70%)
      const content = 'Short word thenveryverylongwordwithoutspacesthatkeeepsgoingandgoing';
      const result = extractSnippet(content, 50);
      // Should include ellipsis since we can't find a good break point
      expect(result).toContain('...');
    });
  });

  describe('getItemTitle', () => {
    it('should return tool name', () => {
      const item: QueryResultItem = {
        type: 'tool',
        id: 'tool-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        tags: [],
        score: 1,
        tool: {
          id: 'tool-1',
          name: 'My Tool',
          category: 'cli',
          scopeType: 'project',
          scopeId: 'proj-1',
          createdAt: '2024-01-01T00:00:00Z',
          isActive: true,
        },
      };
      expect(getItemTitle(item)).toBe('My Tool');
    });

    it('should return guideline name', () => {
      const item: QueryResultItem = {
        type: 'guideline',
        id: 'guide-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        tags: [],
        score: 1,
        guideline: {
          id: 'guide-1',
          name: 'My Guideline',
          category: 'coding',
          priority: 50,
          scopeType: 'project',
          scopeId: 'proj-1',
          createdAt: '2024-01-01T00:00:00Z',
          isActive: true,
        },
      };
      expect(getItemTitle(item)).toBe('My Guideline');
    });

    it('should return knowledge title', () => {
      const item: QueryResultItem = {
        type: 'knowledge',
        id: 'know-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        tags: [],
        score: 1,
        knowledge: {
          id: 'know-1',
          title: 'My Knowledge',
          category: 'fact',
          scopeType: 'project',
          scopeId: 'proj-1',
          createdAt: '2024-01-01T00:00:00Z',
          isActive: true,
        },
      };
      expect(getItemTitle(item)).toBe('My Knowledge');
    });

    it('should return experience title (truncated)', () => {
      const item: QueryResultItem = {
        type: 'experience',
        id: 'exp-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        tags: [],
        score: 1,
        experience: {
          id: 'exp-1',
          title: 'A'.repeat(100), // Very long title
          level: 'case',
          scopeType: 'project',
          scopeId: 'proj-1',
          createdAt: '2024-01-01T00:00:00Z',
          isActive: true,
        },
      };
      expect(getItemTitle(item)).toBe('A'.repeat(50));
    });

    it('should return Untitled for tool without name', () => {
      const item: QueryResultItem = {
        type: 'tool',
        id: 'tool-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        tags: [],
        score: 1,
        tool: {
          id: 'tool-1',
          name: null as unknown as string,
          category: 'cli',
          scopeType: 'project',
          scopeId: 'proj-1',
          createdAt: '2024-01-01T00:00:00Z',
          isActive: true,
        },
      };
      expect(getItemTitle(item)).toBe('Untitled');
    });

    it('should return Untitled for unknown type', () => {
      const item = {
        type: 'unknown',
        id: 'unk-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        tags: [],
        score: 1,
      } as unknown as QueryResultItem;
      expect(getItemTitle(item)).toBe('Untitled');
    });
  });

  describe('getItemContent', () => {
    it('should return tool version description', () => {
      const item: QueryResultItem = {
        type: 'tool',
        id: 'tool-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        tags: [],
        score: 1,
        tool: { id: 'tool-1' } as any,
        version: { description: 'Tool description here' },
      };
      expect(getItemContent(item)).toBe('Tool description here');
    });

    it('should return guideline version content', () => {
      const item: QueryResultItem = {
        type: 'guideline',
        id: 'guide-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        tags: [],
        score: 1,
        guideline: { id: 'guide-1' } as any,
        version: { content: 'Guideline content here' },
      };
      expect(getItemContent(item)).toBe('Guideline content here');
    });

    it('should return knowledge version content', () => {
      const item: QueryResultItem = {
        type: 'knowledge',
        id: 'know-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        tags: [],
        score: 1,
        knowledge: { id: 'know-1' } as any,
        version: { content: 'Knowledge content here' },
      };
      expect(getItemContent(item)).toBe('Knowledge content here');
    });

    it('should return experience content, falling back to scenario then outcome', () => {
      // Test with content
      const itemWithContent: QueryResultItem = {
        type: 'experience',
        id: 'exp-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        tags: [],
        score: 1,
        experience: { id: 'exp-1' } as any,
        version: { content: 'Experience content', scenario: 'Scenario', outcome: 'Outcome' },
      };
      expect(getItemContent(itemWithContent)).toBe('Experience content');

      // Test fallback to scenario
      const itemWithScenario: QueryResultItem = {
        type: 'experience',
        id: 'exp-2',
        scopeType: 'project',
        scopeId: 'proj-1',
        tags: [],
        score: 1,
        experience: { id: 'exp-2' } as any,
        version: { scenario: 'Scenario text', outcome: 'Outcome' },
      };
      expect(getItemContent(itemWithScenario)).toBe('Scenario text');

      // Test fallback to outcome
      const itemWithOutcome: QueryResultItem = {
        type: 'experience',
        id: 'exp-3',
        scopeType: 'project',
        scopeId: 'proj-1',
        tags: [],
        score: 1,
        experience: { id: 'exp-3' } as any,
        version: { outcome: 'Outcome text' },
      };
      expect(getItemContent(itemWithOutcome)).toBe('Outcome text');
    });

    it('should return empty string when no version', () => {
      const item: QueryResultItem = {
        type: 'tool',
        id: 'tool-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        tags: [],
        score: 1,
        tool: { id: 'tool-1' } as any,
      };
      expect(getItemContent(item)).toBe('');
    });

    it('should return empty string for unknown type', () => {
      const item = {
        type: 'unknown',
        id: 'unk-1',
        version: { content: 'some content' },
      } as unknown as QueryResultItem;
      expect(getItemContent(item)).toBe('');
    });
  });

  describe('getItemCategory', () => {
    it('should return tool category', () => {
      const item: QueryResultItem = {
        type: 'tool',
        id: 'tool-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        tags: [],
        score: 1,
        tool: {
          id: 'tool-1',
          name: 'My Tool',
          category: 'cli',
          scopeType: 'project',
          scopeId: 'proj-1',
          createdAt: '2024-01-01T00:00:00Z',
          isActive: true,
        },
      };
      expect(getItemCategory(item)).toBe('cli');
    });

    it('should return guideline category', () => {
      const item: QueryResultItem = {
        type: 'guideline',
        id: 'guide-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        tags: [],
        score: 1,
        guideline: {
          id: 'guide-1',
          name: 'My Guideline',
          category: 'coding',
          priority: 50,
          scopeType: 'project',
          scopeId: 'proj-1',
          createdAt: '2024-01-01T00:00:00Z',
          isActive: true,
        },
      };
      expect(getItemCategory(item)).toBe('coding');
    });

    it('should return knowledge category', () => {
      const item: QueryResultItem = {
        type: 'knowledge',
        id: 'know-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        tags: [],
        score: 1,
        knowledge: {
          id: 'know-1',
          title: 'My Knowledge',
          category: 'fact',
          scopeType: 'project',
          scopeId: 'proj-1',
          createdAt: '2024-01-01T00:00:00Z',
          isActive: true,
        },
      };
      expect(getItemCategory(item)).toBe('fact');
    });

    it('should return experience category', () => {
      const item: QueryResultItem = {
        type: 'experience',
        id: 'exp-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        tags: [],
        score: 1,
        experience: {
          id: 'exp-1',
          title: 'My Experience',
          level: 'case',
          category: 'debugging',
          scopeType: 'project',
          scopeId: 'proj-1',
          createdAt: '2024-01-01T00:00:00Z',
          isActive: true,
        },
      };
      expect(getItemCategory(item)).toBe('debugging');
    });

    it('should return undefined for null category', () => {
      const item: QueryResultItem = {
        type: 'tool',
        id: 'tool-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        tags: [],
        score: 1,
        tool: {
          id: 'tool-1',
          name: 'My Tool',
          category: null,
          scopeType: 'project',
          scopeId: 'proj-1',
          createdAt: '2024-01-01T00:00:00Z',
          isActive: true,
        },
      };
      expect(getItemCategory(item)).toBeUndefined();
    });

    it('should return undefined for unknown type', () => {
      const item = {
        type: 'unknown',
        id: 'unk-1',
      } as unknown as QueryResultItem;
      expect(getItemCategory(item)).toBeUndefined();
    });
  });

  describe('getItemCreatedAt', () => {
    it('should return tool createdAt', () => {
      const item: QueryResultItem = {
        type: 'tool',
        id: 'tool-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        tags: [],
        score: 1,
        tool: {
          id: 'tool-1',
          name: 'My Tool',
          category: 'cli',
          scopeType: 'project',
          scopeId: 'proj-1',
          createdAt: '2024-01-01T00:00:00Z',
          isActive: true,
        },
      };
      expect(getItemCreatedAt(item)).toBe('2024-01-01T00:00:00Z');
    });

    it('should return guideline createdAt', () => {
      const item: QueryResultItem = {
        type: 'guideline',
        id: 'guide-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        tags: [],
        score: 1,
        guideline: {
          id: 'guide-1',
          name: 'My Guideline',
          category: 'coding',
          priority: 50,
          scopeType: 'project',
          scopeId: 'proj-1',
          createdAt: '2024-02-01T00:00:00Z',
          isActive: true,
        },
      };
      expect(getItemCreatedAt(item)).toBe('2024-02-01T00:00:00Z');
    });

    it('should return knowledge createdAt', () => {
      const item: QueryResultItem = {
        type: 'knowledge',
        id: 'know-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        tags: [],
        score: 1,
        knowledge: {
          id: 'know-1',
          title: 'My Knowledge',
          category: 'fact',
          scopeType: 'project',
          scopeId: 'proj-1',
          createdAt: '2024-03-01T00:00:00Z',
          isActive: true,
        },
      };
      expect(getItemCreatedAt(item)).toBe('2024-03-01T00:00:00Z');
    });

    it('should return experience createdAt', () => {
      const item: QueryResultItem = {
        type: 'experience',
        id: 'exp-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        tags: [],
        score: 1,
        experience: {
          id: 'exp-1',
          title: 'My Experience',
          level: 'case',
          scopeType: 'project',
          scopeId: 'proj-1',
          createdAt: '2024-04-01T00:00:00Z',
          isActive: true,
        },
      };
      expect(getItemCreatedAt(item)).toBe('2024-04-01T00:00:00Z');
    });

    it('should return undefined for unknown type', () => {
      const item = {
        type: 'unknown',
        id: 'unk-1',
      } as unknown as QueryResultItem;
      expect(getItemCreatedAt(item)).toBeUndefined();
    });
  });
});
