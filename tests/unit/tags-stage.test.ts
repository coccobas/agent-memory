import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  filterByTags,
  tagsStage,
  postFilterTagsStage,
} from '../../src/services/query/stages/tags.js';
import type { PipelineContext } from '../../src/services/query/pipeline.js';
import type { Tag } from '../../src/db/schema.js';

describe('Tags Stage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('filterByTags', () => {
    const createTags = (...names: string[]): Tag[] =>
      names.map((name, i) => ({
        id: `tag-${i}`,
        name,
        description: null,
        isPredefined: false,
        category: null,
        createdAt: new Date().toISOString(),
      }));

    it('should allow all entries when no filters specified', () => {
      const tagsByEntry: Record<string, Tag[]> = {
        'entry-1': createTags('typescript', 'api'),
        'entry-2': createTags('python'),
        'entry-3': createTags(),
      };

      const allowed = filterByTags(tagsByEntry, {});

      expect(allowed.size).toBe(3);
      expect(allowed.has('entry-1')).toBe(true);
      expect(allowed.has('entry-2')).toBe(true);
      expect(allowed.has('entry-3')).toBe(true);
    });

    describe('include filter', () => {
      it('should only allow entries with at least one included tag', () => {
        const tagsByEntry: Record<string, Tag[]> = {
          'entry-1': createTags('typescript', 'api'),
          'entry-2': createTags('python'),
          'entry-3': createTags('javascript'),
        };

        const allowed = filterByTags(tagsByEntry, {
          include: ['typescript', 'javascript'],
        });

        expect(allowed.size).toBe(2);
        expect(allowed.has('entry-1')).toBe(true);
        expect(allowed.has('entry-3')).toBe(true);
        expect(allowed.has('entry-2')).toBe(false);
      });

      it('should be case insensitive', () => {
        const tagsByEntry: Record<string, Tag[]> = {
          'entry-1': createTags('TypeScript'),
          'entry-2': createTags('typescript'),
        };

        const allowed = filterByTags(tagsByEntry, {
          include: ['TYPESCRIPT'],
        });

        expect(allowed.size).toBe(2);
      });

      it('should allow entries when include is empty array', () => {
        const tagsByEntry: Record<string, Tag[]> = {
          'entry-1': createTags('typescript'),
          'entry-2': createTags('python'),
        };

        const allowed = filterByTags(tagsByEntry, {
          include: [],
        });

        // Empty include means no include filter is applied
        expect(allowed.size).toBe(2);
      });
    });

    describe('exclude filter', () => {
      it('should exclude entries with any excluded tag', () => {
        const tagsByEntry: Record<string, Tag[]> = {
          'entry-1': createTags('typescript', 'deprecated'),
          'entry-2': createTags('python'),
          'entry-3': createTags('deprecated'),
        };

        const allowed = filterByTags(tagsByEntry, {
          exclude: ['deprecated'],
        });

        expect(allowed.size).toBe(1);
        expect(allowed.has('entry-2')).toBe(true);
        expect(allowed.has('entry-1')).toBe(false);
        expect(allowed.has('entry-3')).toBe(false);
      });

      it('should be case insensitive', () => {
        const tagsByEntry: Record<string, Tag[]> = {
          'entry-1': createTags('DEPRECATED'),
          'entry-2': createTags('ok'),
        };

        const allowed = filterByTags(tagsByEntry, {
          exclude: ['deprecated'],
        });

        expect(allowed.size).toBe(1);
        expect(allowed.has('entry-2')).toBe(true);
      });

      it('should exclude entries with any of multiple excluded tags', () => {
        const tagsByEntry: Record<string, Tag[]> = {
          'entry-1': createTags('internal'),
          'entry-2': createTags('deprecated'),
          'entry-3': createTags('ok'),
        };

        const allowed = filterByTags(tagsByEntry, {
          exclude: ['deprecated', 'internal'],
        });

        expect(allowed.size).toBe(1);
        expect(allowed.has('entry-3')).toBe(true);
      });
    });

    describe('require filter', () => {
      it('should only allow entries with all required tags', () => {
        const tagsByEntry: Record<string, Tag[]> = {
          'entry-1': createTags('typescript', 'api', 'documented'),
          'entry-2': createTags('typescript', 'api'),
          'entry-3': createTags('typescript'),
        };

        const allowed = filterByTags(tagsByEntry, {
          require: ['typescript', 'api'],
        });

        expect(allowed.size).toBe(2);
        expect(allowed.has('entry-1')).toBe(true);
        expect(allowed.has('entry-2')).toBe(true);
        expect(allowed.has('entry-3')).toBe(false);
      });

      it('should be case insensitive', () => {
        const tagsByEntry: Record<string, Tag[]> = {
          'entry-1': createTags('TypeScript', 'API'),
        };

        const allowed = filterByTags(tagsByEntry, {
          require: ['typescript', 'api'],
        });

        expect(allowed.size).toBe(1);
      });

      it('should exclude entries missing any required tag', () => {
        const tagsByEntry: Record<string, Tag[]> = {
          'entry-1': createTags('typescript'),
          'entry-2': createTags('api'),
          'entry-3': createTags('typescript', 'api'),
        };

        const allowed = filterByTags(tagsByEntry, {
          require: ['typescript', 'api'],
        });

        expect(allowed.size).toBe(1);
        expect(allowed.has('entry-3')).toBe(true);
      });
    });

    describe('combined filters', () => {
      it('should apply all filters together', () => {
        const tagsByEntry: Record<string, Tag[]> = {
          'entry-1': createTags('typescript', 'api', 'public'),
          'entry-2': createTags('typescript', 'api', 'deprecated'),
          'entry-3': createTags('typescript', 'internal'),
          'entry-4': createTags('python', 'api', 'public'),
        };

        const allowed = filterByTags(tagsByEntry, {
          require: ['api'],
          include: ['typescript', 'python'],
          exclude: ['deprecated'],
        });

        expect(allowed.size).toBe(2);
        expect(allowed.has('entry-1')).toBe(true);
        expect(allowed.has('entry-4')).toBe(true);
        expect(allowed.has('entry-2')).toBe(false); // excluded by deprecated
        expect(allowed.has('entry-3')).toBe(false); // missing api (require)
      });

      it('should process exclude before require and include', () => {
        const tagsByEntry: Record<string, Tag[]> = {
          'entry-1': createTags('typescript', 'api', 'deprecated'),
        };

        // Entry has all required tags, but also has excluded tag
        const allowed = filterByTags(tagsByEntry, {
          require: ['typescript', 'api'],
          exclude: ['deprecated'],
        });

        expect(allowed.size).toBe(0);
      });
    });

    describe('edge cases', () => {
      it('should handle empty tagsByEntry', () => {
        const allowed = filterByTags({}, { include: ['typescript'] });
        expect(allowed.size).toBe(0);
      });

      it('should handle entries with no tags', () => {
        const tagsByEntry: Record<string, Tag[]> = {
          'entry-1': [],
          'entry-2': createTags('typescript'),
        };

        const allowed = filterByTags(tagsByEntry, { include: ['typescript'] });

        expect(allowed.size).toBe(1);
        expect(allowed.has('entry-2')).toBe(true);
        expect(allowed.has('entry-1')).toBe(false);
      });

      it('should handle entries with no tags when no include filter', () => {
        const tagsByEntry: Record<string, Tag[]> = {
          'entry-1': [],
        };

        const allowed = filterByTags(tagsByEntry, {});

        expect(allowed.size).toBe(1);
      });

      it('should exclude entry with no tags if require is specified', () => {
        const tagsByEntry: Record<string, Tag[]> = {
          'entry-1': [],
        };

        const allowed = filterByTags(tagsByEntry, { require: ['typescript'] });

        expect(allowed.size).toBe(0);
      });
    });
  });

  describe('tagsStage', () => {
    const createMockEntry = (id: string) => ({
      entry: { id },
      scopeIndex: 0,
    });

    const createMockContext = (overrides: Partial<PipelineContext> = {}): PipelineContext =>
      ({
        fetchedEntries: {
          tools: [],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
        deps: {
          getTagsForEntries: vi.fn(() => ({})),
          getTagsForEntriesBatch: undefined,
        },
        ...overrides,
      }) as unknown as PipelineContext;

    it('should use batch method when available', () => {
      const mockBatch = vi.fn(() => ({
        'tool-1': [{ id: 't1', name: 'typescript' }],
      }));

      const ctx = createMockContext({
        fetchedEntries: {
          tools: [createMockEntry('tool-1')],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
        deps: {
          getTagsForEntries: vi.fn(),
          getTagsForEntriesBatch: mockBatch,
        },
      });

      const result = tagsStage(ctx);

      expect(mockBatch).toHaveBeenCalledTimes(1);
      expect(result.tagsByEntry).toEqual({
        'tool-1': [{ id: 't1', name: 'typescript' }],
      });
    });

    it('should pass correct entry types to batch method', () => {
      const mockBatch = vi.fn(() => ({}));

      const ctx = createMockContext({
        fetchedEntries: {
          tools: [createMockEntry('tool-1')],
          guidelines: [createMockEntry('guide-1'), createMockEntry('guide-2')],
          knowledge: [createMockEntry('know-1')],
          experiences: [],
        },
        deps: {
          getTagsForEntries: vi.fn(),
          getTagsForEntriesBatch: mockBatch,
        },
      });

      tagsStage(ctx);

      expect(mockBatch).toHaveBeenCalledWith(expect.any(Map));

      const passedMap = mockBatch.mock.calls[0][0] as Map<string, string[]>;
      expect(passedMap.get('tool')).toEqual(['tool-1']);
      expect(passedMap.get('guideline')).toEqual(['guide-1', 'guide-2']);
      expect(passedMap.get('knowledge')).toEqual(['know-1']);
      expect(passedMap.has('experience')).toBe(false); // Empty, not added
    });

    it('should fallback to individual calls when batch not available', () => {
      const mockGetTags = vi.fn((type: string, ids: string[]) => {
        const result: Record<string, Tag[]> = {};
        for (const id of ids) {
          result[id] = [{ id: 't1', name: `tag-for-${type}` }] as Tag[];
        }
        return result;
      });

      const ctx = createMockContext({
        fetchedEntries: {
          tools: [createMockEntry('tool-1')],
          guidelines: [createMockEntry('guide-1')],
          knowledge: [createMockEntry('know-1')],
          experiences: [createMockEntry('exp-1')],
        },
        deps: {
          getTagsForEntries: mockGetTags,
          getTagsForEntriesBatch: undefined,
        },
      });

      const result = tagsStage(ctx);

      expect(mockGetTags).toHaveBeenCalledTimes(4);
      expect(mockGetTags).toHaveBeenCalledWith('tool', ['tool-1']);
      expect(mockGetTags).toHaveBeenCalledWith('guideline', ['guide-1']);
      expect(mockGetTags).toHaveBeenCalledWith('knowledge', ['know-1']);
      expect(mockGetTags).toHaveBeenCalledWith('experience', ['exp-1']);

      expect(result.tagsByEntry['tool-1']).toBeDefined();
      expect(result.tagsByEntry['guide-1']).toBeDefined();
      expect(result.tagsByEntry['know-1']).toBeDefined();
      expect(result.tagsByEntry['exp-1']).toBeDefined();
    });

    it('should skip empty entry types in fallback mode', () => {
      const mockGetTags = vi.fn(() => ({}));

      const ctx = createMockContext({
        fetchedEntries: {
          tools: [createMockEntry('tool-1')],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
        deps: {
          getTagsForEntries: mockGetTags,
          getTagsForEntriesBatch: undefined,
        },
      });

      tagsStage(ctx);

      expect(mockGetTags).toHaveBeenCalledTimes(1);
      expect(mockGetTags).toHaveBeenCalledWith('tool', ['tool-1']);
    });

    it('should handle no entries', () => {
      const mockGetTags = vi.fn(() => ({}));

      const ctx = createMockContext({
        fetchedEntries: {
          tools: [],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
        deps: {
          getTagsForEntries: mockGetTags,
          getTagsForEntriesBatch: undefined,
        },
      });

      const result = tagsStage(ctx);

      expect(mockGetTags).not.toHaveBeenCalled();
      expect(result.tagsByEntry).toEqual({});
    });

    it('should preserve other context properties', () => {
      const ctx = createMockContext({
        fetchedEntries: {
          tools: [],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
        search: 'test query',
        limit: 50,
      });

      const result = tagsStage(ctx);

      expect(result.search).toBe('test query');
      expect(result.limit).toBe(50);
    });
  });

  describe('postFilterTagsStage', () => {
    const createMockFilteredEntry = (id: string) => ({
      entry: { id },
      scopeIndex: 0,
      tags: [],
      textMatched: false,
      matchingTagCount: 0,
      hasExplicitRelation: false,
    });

    const createMockContext = (overrides: Partial<PipelineContext> = {}): PipelineContext =>
      ({
        deps: {
          getTagsForEntries: vi.fn(() => ({})),
          getTagsForEntriesBatch: undefined,
        },
        ...overrides,
      }) as unknown as PipelineContext;

    it('should return context as-is when no filtered entries', () => {
      const ctx = createMockContext({
        filtered: undefined,
      });

      const result = postFilterTagsStage(ctx);

      expect(result).toBe(ctx);
    });

    it('should use batch method when available', () => {
      const mockBatch = vi.fn(() => ({
        'tool-1': [{ id: 't1', name: 'typescript' }],
      }));

      const ctx = createMockContext({
        filtered: {
          tools: [createMockFilteredEntry('tool-1')],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
        deps: {
          getTagsForEntries: vi.fn(),
          getTagsForEntriesBatch: mockBatch,
        },
      });

      const result = postFilterTagsStage(ctx);

      expect(mockBatch).toHaveBeenCalledTimes(1);
      expect(result.tagsByEntry).toEqual({
        'tool-1': [{ id: 't1', name: 'typescript' }],
      });
    });

    it('should fallback to individual calls when batch not available', () => {
      const mockGetTags = vi.fn((type: string, ids: string[]) => {
        const result: Record<string, Tag[]> = {};
        for (const id of ids) {
          result[id] = [{ id: 't1', name: `tag-for-${type}` }] as Tag[];
        }
        return result;
      });

      const ctx = createMockContext({
        filtered: {
          tools: [createMockFilteredEntry('tool-1')],
          guidelines: [createMockFilteredEntry('guide-1')],
          knowledge: [createMockFilteredEntry('know-1')],
          experiences: [createMockFilteredEntry('exp-1')],
        },
        deps: {
          getTagsForEntries: mockGetTags,
          getTagsForEntriesBatch: undefined,
        },
      });

      const result = postFilterTagsStage(ctx);

      expect(mockGetTags).toHaveBeenCalledTimes(4);
      expect(result.tagsByEntry['tool-1']).toBeDefined();
      expect(result.tagsByEntry['guide-1']).toBeDefined();
      expect(result.tagsByEntry['know-1']).toBeDefined();
      expect(result.tagsByEntry['exp-1']).toBeDefined();
    });

    it('should skip empty entry types in batch mode', () => {
      const mockBatch = vi.fn(() => ({}));

      const ctx = createMockContext({
        filtered: {
          tools: [createMockFilteredEntry('tool-1')],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
        deps: {
          getTagsForEntries: vi.fn(),
          getTagsForEntriesBatch: mockBatch,
        },
      });

      postFilterTagsStage(ctx);

      const passedMap = mockBatch.mock.calls[0][0] as Map<string, string[]>;
      expect(passedMap.get('tool')).toEqual(['tool-1']);
      expect(passedMap.has('guideline')).toBe(false);
      expect(passedMap.has('knowledge')).toBe(false);
      expect(passedMap.has('experience')).toBe(false);
    });

    it('should skip empty entry types in fallback mode', () => {
      const mockGetTags = vi.fn(() => ({}));

      const ctx = createMockContext({
        filtered: {
          tools: [],
          guidelines: [createMockFilteredEntry('guide-1')],
          knowledge: [],
          experiences: [],
        },
        deps: {
          getTagsForEntries: mockGetTags,
          getTagsForEntriesBatch: undefined,
        },
      });

      postFilterTagsStage(ctx);

      expect(mockGetTags).toHaveBeenCalledTimes(1);
      expect(mockGetTags).toHaveBeenCalledWith('guideline', ['guide-1']);
    });

    it('should preserve other context properties', () => {
      const ctx = createMockContext({
        filtered: {
          tools: [],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
        search: 'test query',
        limit: 50,
        results: [{ id: 'r1' }],
      });

      const result = postFilterTagsStage(ctx);

      expect(result.search).toBe('test query');
      expect(result.limit).toBe(50);
      expect(result.results).toEqual([{ id: 'r1' }]);
    });
  });
});
