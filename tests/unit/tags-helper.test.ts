/**
 * Tests for Tags Helper
 *
 * Tests the batch tag fetching utilities for memory entries.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Tag } from '../../src/db/schema.js';
import {
  getTagsForEntries,
  getTagsForEntriesBatch,
  type QueryEntryType,
} from '../../src/services/query/tags-helper.js';

// Mock Tag type for testing
function createMockTag(id: string, name: string): Tag {
  return {
    id,
    name,
    description: `Description for ${name}`,
    category: 'custom',
    isPredefined: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Create a mock database client
function createMockDb(
  entryTagRows: Array<{ tagId: string; entryId: string; entryType: string }> = [],
  tagRows: Tag[] = []
) {
  let queryCount = 0;

  const mockAll = vi.fn(() => {
    queryCount++;
    // First call returns entryTagRows, second call returns tagRows
    return queryCount === 1 ? entryTagRows : tagRows;
  });

  const mockWhere = vi.fn(() => ({ all: mockAll }));
  const mockFrom = vi.fn(() => ({ where: mockWhere, all: mockAll }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));

  return {
    select: mockSelect,
    _mocks: { mockSelect, mockFrom, mockWhere, mockAll },
    _resetQueryCount: () => {
      queryCount = 0;
    },
  };
}

describe('Tags Helper', () => {
  describe('getTagsForEntries', () => {
    describe('empty input handling', () => {
      it('should return empty object when entryIds is empty', () => {
        const mockDb = createMockDb();

        const result = getTagsForEntries(
          'tool',
          [],
          mockDb as unknown as Parameters<typeof getTagsForEntries>[2]
        );

        expect(result).toEqual({});
        expect(mockDb._mocks.mockSelect).not.toHaveBeenCalled();
      });

      it('should return empty object when no entry tags found', () => {
        const mockDb = createMockDb([], []);

        const result = getTagsForEntries(
          'tool',
          ['t1', 't2'],
          mockDb as unknown as Parameters<typeof getTagsForEntries>[2]
        );

        expect(result).toEqual({});
      });
    });

    describe('single entry type queries', () => {
      it('should fetch tags for tool entries', () => {
        const tag1 = createMockTag('tag-1', 'javascript');
        const tag2 = createMockTag('tag-2', 'testing');

        const entryTagRows = [
          { tagId: 'tag-1', entryId: 't1', entryType: 'tool' },
          { tagId: 'tag-2', entryId: 't1', entryType: 'tool' },
        ];

        const mockDb = createMockDb(entryTagRows, [tag1, tag2]);

        const result = getTagsForEntries(
          'tool',
          ['t1'],
          mockDb as unknown as Parameters<typeof getTagsForEntries>[2]
        );

        expect(result['t1']).toBeDefined();
        expect(result['t1']).toHaveLength(2);
        expect(result['t1']?.map((t) => t.name)).toContain('javascript');
        expect(result['t1']?.map((t) => t.name)).toContain('testing');
      });

      it('should fetch tags for guideline entries', () => {
        const tag = createMockTag('tag-1', 'security');

        const entryTagRows = [{ tagId: 'tag-1', entryId: 'g1', entryType: 'guideline' }];

        const mockDb = createMockDb(entryTagRows, [tag]);

        const result = getTagsForEntries(
          'guideline',
          ['g1'],
          mockDb as unknown as Parameters<typeof getTagsForEntries>[2]
        );

        expect(result['g1']).toHaveLength(1);
        expect(result['g1']?.[0]?.name).toBe('security');
      });

      it('should fetch tags for knowledge entries', () => {
        const tag = createMockTag('tag-1', 'architecture');

        const entryTagRows = [{ tagId: 'tag-1', entryId: 'k1', entryType: 'knowledge' }];

        const mockDb = createMockDb(entryTagRows, [tag]);

        const result = getTagsForEntries(
          'knowledge',
          ['k1'],
          mockDb as unknown as Parameters<typeof getTagsForEntries>[2]
        );

        expect(result['k1']).toHaveLength(1);
        expect(result['k1']?.[0]?.name).toBe('architecture');
      });

      it('should fetch tags for experience entries', () => {
        const tag = createMockTag('tag-1', 'debugging');

        const entryTagRows = [{ tagId: 'tag-1', entryId: 'e1', entryType: 'experience' }];

        const mockDb = createMockDb(entryTagRows, [tag]);

        const result = getTagsForEntries(
          'experience',
          ['e1'],
          mockDb as unknown as Parameters<typeof getTagsForEntries>[2]
        );

        expect(result['e1']).toHaveLength(1);
        expect(result['e1']?.[0]?.name).toBe('debugging');
      });
    });

    describe('multiple entries', () => {
      it('should fetch tags for multiple entries', () => {
        const tag1 = createMockTag('tag-1', 'javascript');
        const tag2 = createMockTag('tag-2', 'python');
        const tag3 = createMockTag('tag-3', 'testing');

        const entryTagRows = [
          { tagId: 'tag-1', entryId: 't1', entryType: 'tool' },
          { tagId: 'tag-2', entryId: 't2', entryType: 'tool' },
          { tagId: 'tag-3', entryId: 't1', entryType: 'tool' },
          { tagId: 'tag-3', entryId: 't2', entryType: 'tool' },
        ];

        const mockDb = createMockDb(entryTagRows, [tag1, tag2, tag3]);

        const result = getTagsForEntries(
          'tool',
          ['t1', 't2'],
          mockDb as unknown as Parameters<typeof getTagsForEntries>[2]
        );

        expect(result['t1']).toHaveLength(2);
        expect(result['t2']).toHaveLength(2);
        expect(result['t1']?.map((t) => t.name)).toContain('javascript');
        expect(result['t1']?.map((t) => t.name)).toContain('testing');
        expect(result['t2']?.map((t) => t.name)).toContain('python');
        expect(result['t2']?.map((t) => t.name)).toContain('testing');
      });

      it('should handle entries with no tags', () => {
        const tag1 = createMockTag('tag-1', 'javascript');

        const entryTagRows = [
          { tagId: 'tag-1', entryId: 't1', entryType: 'tool' },
          // t2 has no tags
        ];

        const mockDb = createMockDb(entryTagRows, [tag1]);

        const result = getTagsForEntries(
          'tool',
          ['t1', 't2'],
          mockDb as unknown as Parameters<typeof getTagsForEntries>[2]
        );

        expect(result['t1']).toHaveLength(1);
        expect(result['t2']).toBeUndefined();
      });
    });

    describe('tag lookup', () => {
      it('should skip entry tags with missing tag data', () => {
        const tag1 = createMockTag('tag-1', 'javascript');
        // tag-2 is not in the tags table

        const entryTagRows = [
          { tagId: 'tag-1', entryId: 't1', entryType: 'tool' },
          { tagId: 'tag-2', entryId: 't1', entryType: 'tool' }, // missing tag
        ];

        const mockDb = createMockDb(entryTagRows, [tag1]); // only tag1 exists

        const result = getTagsForEntries(
          'tool',
          ['t1'],
          mockDb as unknown as Parameters<typeof getTagsForEntries>[2]
        );

        expect(result['t1']).toHaveLength(1);
        expect(result['t1']?.[0]?.name).toBe('javascript');
      });

      it('should deduplicate tag IDs before fetching', () => {
        const tag1 = createMockTag('tag-1', 'javascript');

        const entryTagRows = [
          { tagId: 'tag-1', entryId: 't1', entryType: 'tool' },
          { tagId: 'tag-1', entryId: 't2', entryType: 'tool' }, // same tag for different entries
        ];

        const mockDb = createMockDb(entryTagRows, [tag1]);

        const result = getTagsForEntries(
          'tool',
          ['t1', 't2'],
          mockDb as unknown as Parameters<typeof getTagsForEntries>[2]
        );

        // Both entries should get the same tag
        expect(result['t1']?.[0]?.id).toBe('tag-1');
        expect(result['t2']?.[0]?.id).toBe('tag-1');
      });
    });
  });

  describe('getTagsForEntriesBatch', () => {
    describe('empty input handling', () => {
      it('should return empty object when entriesByType is empty', () => {
        const mockDb = createMockDb();
        const entriesByType = new Map<QueryEntryType, string[]>();

        const result = getTagsForEntriesBatch(
          entriesByType,
          mockDb as unknown as Parameters<typeof getTagsForEntriesBatch>[1]
        );

        expect(result).toEqual({});
        expect(mockDb._mocks.mockSelect).not.toHaveBeenCalled();
      });

      it('should return empty object when all entry arrays are empty', () => {
        const mockDb = createMockDb();
        const entriesByType = new Map<QueryEntryType, string[]>([
          ['tool', []],
          ['guideline', []],
        ]);

        const result = getTagsForEntriesBatch(
          entriesByType,
          mockDb as unknown as Parameters<typeof getTagsForEntriesBatch>[1]
        );

        expect(result).toEqual({});
      });

      it('should return empty object when no entry tags found', () => {
        const mockDb = createMockDb([], []);
        const entriesByType = new Map<QueryEntryType, string[]>([['tool', ['t1']]]);

        const result = getTagsForEntriesBatch(
          entriesByType,
          mockDb as unknown as Parameters<typeof getTagsForEntriesBatch>[1]
        );

        expect(result).toEqual({});
      });
    });

    describe('single type batch queries', () => {
      it('should fetch tags for single tool type', () => {
        const tag1 = createMockTag('tag-1', 'javascript');

        const entryTagRows = [{ tagId: 'tag-1', entryId: 't1', entryType: 'tool' }];

        const mockDb = createMockDb(entryTagRows, [tag1]);
        const entriesByType = new Map<QueryEntryType, string[]>([['tool', ['t1']]]);

        const result = getTagsForEntriesBatch(
          entriesByType,
          mockDb as unknown as Parameters<typeof getTagsForEntriesBatch>[1]
        );

        expect(result['t1']).toHaveLength(1);
        expect(result['t1']?.[0]?.name).toBe('javascript');
      });

      it('should fetch tags for single guideline type', () => {
        const tag1 = createMockTag('tag-1', 'security');

        const entryTagRows = [{ tagId: 'tag-1', entryId: 'g1', entryType: 'guideline' }];

        const mockDb = createMockDb(entryTagRows, [tag1]);
        const entriesByType = new Map<QueryEntryType, string[]>([['guideline', ['g1']]]);

        const result = getTagsForEntriesBatch(
          entriesByType,
          mockDb as unknown as Parameters<typeof getTagsForEntriesBatch>[1]
        );

        expect(result['g1']).toHaveLength(1);
        expect(result['g1']?.[0]?.name).toBe('security');
      });
    });

    describe('multiple type batch queries', () => {
      it('should fetch tags for multiple entry types in single query', () => {
        const tag1 = createMockTag('tag-1', 'javascript');
        const tag2 = createMockTag('tag-2', 'security');
        const tag3 = createMockTag('tag-3', 'architecture');

        const entryTagRows = [
          { tagId: 'tag-1', entryId: 't1', entryType: 'tool' },
          { tagId: 'tag-2', entryId: 'g1', entryType: 'guideline' },
          { tagId: 'tag-3', entryId: 'k1', entryType: 'knowledge' },
        ];

        const mockDb = createMockDb(entryTagRows, [tag1, tag2, tag3]);
        const entriesByType = new Map<QueryEntryType, string[]>([
          ['tool', ['t1']],
          ['guideline', ['g1']],
          ['knowledge', ['k1']],
        ]);

        const result = getTagsForEntriesBatch(
          entriesByType,
          mockDb as unknown as Parameters<typeof getTagsForEntriesBatch>[1]
        );

        expect(result['t1']?.[0]?.name).toBe('javascript');
        expect(result['g1']?.[0]?.name).toBe('security');
        expect(result['k1']?.[0]?.name).toBe('architecture');
      });

      it('should handle all four entry types', () => {
        const tag1 = createMockTag('tag-1', 'tool-tag');
        const tag2 = createMockTag('tag-2', 'guideline-tag');
        const tag3 = createMockTag('tag-3', 'knowledge-tag');
        const tag4 = createMockTag('tag-4', 'experience-tag');

        const entryTagRows = [
          { tagId: 'tag-1', entryId: 't1', entryType: 'tool' },
          { tagId: 'tag-2', entryId: 'g1', entryType: 'guideline' },
          { tagId: 'tag-3', entryId: 'k1', entryType: 'knowledge' },
          { tagId: 'tag-4', entryId: 'e1', entryType: 'experience' },
        ];

        const mockDb = createMockDb(entryTagRows, [tag1, tag2, tag3, tag4]);
        const entriesByType = new Map<QueryEntryType, string[]>([
          ['tool', ['t1']],
          ['guideline', ['g1']],
          ['knowledge', ['k1']],
          ['experience', ['e1']],
        ]);

        const result = getTagsForEntriesBatch(
          entriesByType,
          mockDb as unknown as Parameters<typeof getTagsForEntriesBatch>[1]
        );

        expect(Object.keys(result)).toHaveLength(4);
        expect(result['t1']?.[0]?.name).toBe('tool-tag');
        expect(result['g1']?.[0]?.name).toBe('guideline-tag');
        expect(result['k1']?.[0]?.name).toBe('knowledge-tag');
        expect(result['e1']?.[0]?.name).toBe('experience-tag');
      });

      it('should handle mixed empty and non-empty entry arrays', () => {
        const tag1 = createMockTag('tag-1', 'javascript');

        const entryTagRows = [{ tagId: 'tag-1', entryId: 't1', entryType: 'tool' }];

        const mockDb = createMockDb(entryTagRows, [tag1]);
        const entriesByType = new Map<QueryEntryType, string[]>([
          ['tool', ['t1']],
          ['guideline', []], // empty
          ['knowledge', []], // empty
        ]);

        const result = getTagsForEntriesBatch(
          entriesByType,
          mockDb as unknown as Parameters<typeof getTagsForEntriesBatch>[1]
        );

        expect(result['t1']).toHaveLength(1);
        expect(Object.keys(result)).toHaveLength(1);
      });
    });

    describe('multiple entries per type', () => {
      it('should fetch tags for multiple entries of same type', () => {
        const tag1 = createMockTag('tag-1', 'javascript');
        const tag2 = createMockTag('tag-2', 'python');

        const entryTagRows = [
          { tagId: 'tag-1', entryId: 't1', entryType: 'tool' },
          { tagId: 'tag-2', entryId: 't2', entryType: 'tool' },
        ];

        const mockDb = createMockDb(entryTagRows, [tag1, tag2]);
        const entriesByType = new Map<QueryEntryType, string[]>([
          ['tool', ['t1', 't2', 't3']], // t3 has no tags
        ]);

        const result = getTagsForEntriesBatch(
          entriesByType,
          mockDb as unknown as Parameters<typeof getTagsForEntriesBatch>[1]
        );

        expect(result['t1']?.[0]?.name).toBe('javascript');
        expect(result['t2']?.[0]?.name).toBe('python');
        expect(result['t3']).toBeUndefined();
      });

      it('should handle shared tags across entries', () => {
        const sharedTag = createMockTag('tag-shared', 'testing');

        const entryTagRows = [
          { tagId: 'tag-shared', entryId: 't1', entryType: 'tool' },
          { tagId: 'tag-shared', entryId: 'g1', entryType: 'guideline' },
        ];

        const mockDb = createMockDb(entryTagRows, [sharedTag]);
        const entriesByType = new Map<QueryEntryType, string[]>([
          ['tool', ['t1']],
          ['guideline', ['g1']],
        ]);

        const result = getTagsForEntriesBatch(
          entriesByType,
          mockDb as unknown as Parameters<typeof getTagsForEntriesBatch>[1]
        );

        expect(result['t1']?.[0]?.id).toBe('tag-shared');
        expect(result['g1']?.[0]?.id).toBe('tag-shared');
      });
    });

    describe('tag lookup', () => {
      it('should skip entry tags with missing tag data', () => {
        const tag1 = createMockTag('tag-1', 'javascript');

        const entryTagRows = [
          { tagId: 'tag-1', entryId: 't1', entryType: 'tool' },
          { tagId: 'tag-missing', entryId: 't2', entryType: 'tool' },
        ];

        const mockDb = createMockDb(entryTagRows, [tag1]);
        const entriesByType = new Map<QueryEntryType, string[]>([['tool', ['t1', 't2']]]);

        const result = getTagsForEntriesBatch(
          entriesByType,
          mockDb as unknown as Parameters<typeof getTagsForEntriesBatch>[1]
        );

        expect(result['t1']).toHaveLength(1);
        expect(result['t2']).toBeUndefined();
      });

      it('should deduplicate tag IDs before fetching', () => {
        const sharedTag = createMockTag('tag-1', 'shared');

        const entryTagRows = [
          { tagId: 'tag-1', entryId: 't1', entryType: 'tool' },
          { tagId: 'tag-1', entryId: 't2', entryType: 'tool' },
          { tagId: 'tag-1', entryId: 'g1', entryType: 'guideline' },
        ];

        const mockDb = createMockDb(entryTagRows, [sharedTag]);
        const entriesByType = new Map<QueryEntryType, string[]>([
          ['tool', ['t1', 't2']],
          ['guideline', ['g1']],
        ]);

        const result = getTagsForEntriesBatch(
          entriesByType,
          mockDb as unknown as Parameters<typeof getTagsForEntriesBatch>[1]
        );

        // All entries should reference the same tag
        expect(result['t1']?.[0]?.id).toBe('tag-1');
        expect(result['t2']?.[0]?.id).toBe('tag-1');
        expect(result['g1']?.[0]?.id).toBe('tag-1');
      });
    });

    describe('entry ID collection', () => {
      it('should build entry type map correctly', () => {
        const tag1 = createMockTag('tag-1', 'test');

        const entryTagRows = [{ tagId: 'tag-1', entryId: 't1', entryType: 'tool' }];

        const mockDb = createMockDb(entryTagRows, [tag1]);
        const entriesByType = new Map<QueryEntryType, string[]>([
          ['tool', ['t1', 't2']],
          ['guideline', ['g1']],
        ]);

        // Just verify it doesn't throw and returns expected structure
        const result = getTagsForEntriesBatch(
          entriesByType,
          mockDb as unknown as Parameters<typeof getTagsForEntriesBatch>[1]
        );

        expect(result).toBeDefined();
        expect(typeof result).toBe('object');
      });
    });
  });

  describe('QueryEntryType', () => {
    it('should support tool type', () => {
      const entryType: QueryEntryType = 'tool';
      expect(entryType).toBe('tool');
    });

    it('should support guideline type', () => {
      const entryType: QueryEntryType = 'guideline';
      expect(entryType).toBe('guideline');
    });

    it('should support knowledge type', () => {
      const entryType: QueryEntryType = 'knowledge';
      expect(entryType).toBe('knowledge');
    });

    it('should support experience type', () => {
      const entryType: QueryEntryType = 'experience';
      expect(entryType).toBe('experience');
    });
  });
});
