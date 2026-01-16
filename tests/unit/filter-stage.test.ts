import { describe, it, expect, vi, beforeEach } from 'vitest';
import { filterStage } from '../../src/services/query/stages/filter.js';
import type { PipelineContext, ScopeInfo } from '../../src/services/query/pipeline.js';
import type { Tag, Guideline, Knowledge, Tool, Experience } from '../../src/db/schema.js';

describe('Filter Stage', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const createMockTag = (name: string): Tag => ({
    id: `tag-${name}`,
    name,
    description: null,
    isPredefined: false,
    category: null,
    createdAt: new Date().toISOString(),
  });

  const createMockTool = (id: string, name: string, opts: Partial<Tool> = {}): Tool => ({
    id,
    name,
    category: 'cli',
    scopeType: 'project',
    scopeId: 'proj-123',
    createdAt: '2024-01-15T00:00:00Z',
    isActive: true,
    ...opts,
  });

  const createMockGuideline = (
    id: string,
    name: string,
    opts: Partial<Guideline> = {}
  ): Guideline => ({
    id,
    name,
    category: 'coding',
    priority: 50,
    scopeType: 'project',
    scopeId: 'proj-123',
    createdAt: '2024-01-15T00:00:00Z',
    isActive: true,
    ...opts,
  });

  const createMockKnowledge = (
    id: string,
    title: string,
    opts: Partial<Knowledge> = {}
  ): Knowledge => ({
    id,
    title,
    category: 'fact',
    scopeType: 'project',
    scopeId: 'proj-123',
    createdAt: '2024-01-15T00:00:00Z',
    isActive: true,
    ...opts,
  });

  const createMockExperience = (
    id: string,
    title: string,
    opts: Partial<Experience> = {}
  ): Experience => ({
    id,
    title,
    level: 'case',
    scopeType: 'project',
    scopeId: 'proj-123',
    createdAt: '2024-01-15T00:00:00Z',
    isActive: true,
    ...opts,
  });

  const createContext = (overrides: Partial<PipelineContext> = {}): PipelineContext =>
    ({
      params: {},
      types: ['tools', 'guidelines', 'knowledge', 'experiences'] as const,
      fetchedEntries: {
        tools: [],
        guidelines: [],
        knowledge: [],
        experiences: [],
      },
      tagsByEntry: {},
      relatedIds: {
        tool: new Set<string>(),
        guideline: new Set<string>(),
        knowledge: new Set<string>(),
        experience: new Set<string>(),
      },
      deps: {
        logger: mockLogger,
        executeFts5Query: vi.fn(() => null),
        getPreparedStatement: vi.fn(() => ({ all: vi.fn(() => []) })),
      },
      completedStages: new Set(['fetch', 'tags']),
      ...overrides,
    }) as unknown as PipelineContext;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('basic filtering', () => {
    it('should return empty filtered results when no entries', () => {
      const ctx = createContext();
      const result = filterStage(ctx);

      expect(result.filtered).toBeDefined();
      expect(result.filtered.tools).toEqual([]);
      expect(result.filtered.guidelines).toEqual([]);
      expect(result.filtered.knowledge).toEqual([]);
      expect(result.filtered.experiences).toEqual([]);
    });

    it('should pass all entries when no filters applied', () => {
      const ctx = createContext({
        fetchedEntries: {
          tools: [{ entry: createMockTool('tool-1', 'Tool One'), scopeIndex: 0 }],
          guidelines: [{ entry: createMockGuideline('guide-1', 'Guideline One'), scopeIndex: 0 }],
          knowledge: [{ entry: createMockKnowledge('know-1', 'Knowledge One'), scopeIndex: 0 }],
          experiences: [{ entry: createMockExperience('exp-1', 'Experience One'), scopeIndex: 0 }],
        },
      });

      const result = filterStage(ctx);

      expect(result.filtered.tools).toHaveLength(1);
      expect(result.filtered.guidelines).toHaveLength(1);
      expect(result.filtered.knowledge).toHaveLength(1);
      expect(result.filtered.experiences).toHaveLength(1);
    });

    it('should only filter types included in types array', () => {
      const ctx = createContext({
        types: ['tools'] as any,
        fetchedEntries: {
          tools: [{ entry: createMockTool('tool-1', 'Tool One'), scopeIndex: 0 }],
          guidelines: [{ entry: createMockGuideline('guide-1', 'Guideline One'), scopeIndex: 0 }],
          knowledge: [],
          experiences: [],
        },
      });

      const result = filterStage(ctx);

      expect(result.filtered.tools).toHaveLength(1);
      expect(result.filtered.guidelines).toHaveLength(0); // Not in types
    });
  });

  describe('deduplication', () => {
    it('should deduplicate entries by scope, scopeId, and name', () => {
      const tool1 = createMockTool('tool-1', 'Duplicate');
      const tool2 = createMockTool('tool-2', 'Duplicate');

      const ctx = createContext({
        fetchedEntries: {
          tools: [
            { entry: tool1, scopeIndex: 1 },
            { entry: tool2, scopeIndex: 0 }, // More specific scope, should win
          ],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
      });

      const result = filterStage(ctx);

      expect(result.filtered.tools).toHaveLength(1);
      expect(result.filtered.tools[0].entry.id).toBe('tool-2');
    });

    it('should keep entries with different names', () => {
      const tool1 = createMockTool('tool-1', 'Tool A');
      const tool2 = createMockTool('tool-2', 'Tool B');

      const ctx = createContext({
        fetchedEntries: {
          tools: [
            { entry: tool1, scopeIndex: 0 },
            { entry: tool2, scopeIndex: 0 },
          ],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
      });

      const result = filterStage(ctx);

      expect(result.filtered.tools).toHaveLength(2);
    });
  });

  describe('tag filtering', () => {
    it('should filter by include tags', () => {
      const tool1 = createMockTool('tool-1', 'Tool One');
      const tool2 = createMockTool('tool-2', 'Tool Two');

      const ctx = createContext({
        params: {
          tags: { include: ['typescript'] },
        },
        fetchedEntries: {
          tools: [
            { entry: tool1, scopeIndex: 0 },
            { entry: tool2, scopeIndex: 0 },
          ],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
        tagsByEntry: {
          'tool-1': [createMockTag('typescript')],
          'tool-2': [createMockTag('python')],
        },
      });

      const result = filterStage(ctx);

      expect(result.filtered.tools).toHaveLength(1);
      expect(result.filtered.tools[0].entry.id).toBe('tool-1');
    });

    it('should calculate matchingTagCount', () => {
      const tool = createMockTool('tool-1', 'Tool One');

      const ctx = createContext({
        params: {
          tags: { include: ['typescript', 'api', 'test'] },
        },
        fetchedEntries: {
          tools: [{ entry: tool, scopeIndex: 0 }],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
        tagsByEntry: {
          'tool-1': [createMockTag('typescript'), createMockTag('api')],
        },
      });

      const result = filterStage(ctx);

      expect(result.filtered.tools[0].matchingTagCount).toBe(2);
    });
  });

  describe('relation filtering', () => {
    it('should filter by relatedTo', () => {
      const tool1 = createMockTool('tool-1', 'Tool One');
      const tool2 = createMockTool('tool-2', 'Tool Two');

      const ctx = createContext({
        params: {
          relatedTo: { id: 'parent-123', type: 'knowledge' },
        },
        fetchedEntries: {
          tools: [
            { entry: tool1, scopeIndex: 0 },
            { entry: tool2, scopeIndex: 0 },
          ],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
        relatedIds: {
          tool: new Set(['tool-1']),
          guideline: new Set(),
          knowledge: new Set(),
          experience: new Set(),
        },
      });

      const result = filterStage(ctx);

      expect(result.filtered.tools).toHaveLength(1);
      expect(result.filtered.tools[0].entry.id).toBe('tool-1');
      expect(result.filtered.tools[0].hasExplicitRelation).toBe(true);
    });
  });

  describe('FTS filtering', () => {
    it('should filter by ftsMatchIds', () => {
      const tool1 = createMockTool('tool-1', 'Tool One');
      const tool2 = createMockTool('tool-2', 'Tool Two');

      const ctx = createContext({
        fetchedEntries: {
          tools: [
            { entry: tool1, scopeIndex: 0 },
            { entry: tool2, scopeIndex: 0 },
          ],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
        ftsMatchIds: {
          tool: new Set(['tool-1']),
          guideline: new Set(),
          knowledge: new Set(),
          experience: new Set(),
        },
      });

      const result = filterStage(ctx);

      expect(result.filtered.tools).toHaveLength(1);
      expect(result.filtered.tools[0].entry.id).toBe('tool-1');
    });
  });

  describe('date filtering', () => {
    it('should filter by createdAfter', () => {
      const oldTool = createMockTool('tool-1', 'Old Tool', {
        createdAt: '2024-01-01T00:00:00Z',
      });
      const newTool = createMockTool('tool-2', 'New Tool', {
        createdAt: '2024-06-01T00:00:00Z',
      });

      const ctx = createContext({
        params: {
          createdAfter: '2024-03-01T00:00:00Z',
        },
        fetchedEntries: {
          tools: [
            { entry: oldTool, scopeIndex: 0 },
            { entry: newTool, scopeIndex: 0 },
          ],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
      });

      const result = filterStage(ctx);

      expect(result.filtered.tools).toHaveLength(1);
      expect(result.filtered.tools[0].entry.id).toBe('tool-2');
    });

    it('should filter by createdBefore', () => {
      const oldTool = createMockTool('tool-1', 'Old Tool', {
        createdAt: '2024-01-01T00:00:00Z',
      });
      const newTool = createMockTool('tool-2', 'New Tool', {
        createdAt: '2024-06-01T00:00:00Z',
      });

      const ctx = createContext({
        params: {
          createdBefore: '2024-03-01T00:00:00Z',
        },
        fetchedEntries: {
          tools: [
            { entry: oldTool, scopeIndex: 0 },
            { entry: newTool, scopeIndex: 0 },
          ],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
      });

      const result = filterStage(ctx);

      expect(result.filtered.tools).toHaveLength(1);
      expect(result.filtered.tools[0].entry.id).toBe('tool-1');
    });

    it('should filter by date range', () => {
      const earlyTool = createMockTool('tool-1', 'Early Tool', {
        createdAt: '2024-01-01T00:00:00Z',
      });
      const midTool = createMockTool('tool-2', 'Mid Tool', {
        createdAt: '2024-05-01T00:00:00Z',
      });
      const lateTool = createMockTool('tool-3', 'Late Tool', {
        createdAt: '2024-12-01T00:00:00Z',
      });

      const ctx = createContext({
        params: {
          createdAfter: '2024-03-01T00:00:00Z',
          createdBefore: '2024-09-01T00:00:00Z',
        },
        fetchedEntries: {
          tools: [
            { entry: earlyTool, scopeIndex: 0 },
            { entry: midTool, scopeIndex: 0 },
            { entry: lateTool, scopeIndex: 0 },
          ],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
      });

      const result = filterStage(ctx);

      expect(result.filtered.tools).toHaveLength(1);
      expect(result.filtered.tools[0].entry.id).toBe('tool-2');
    });
  });

  describe('priority filtering', () => {
    it('should filter guidelines by minimum priority', () => {
      const lowPriority = createMockGuideline('guide-1', 'Low Priority', { priority: 20 });
      const highPriority = createMockGuideline('guide-2', 'High Priority', { priority: 80 });

      const ctx = createContext({
        params: {
          priority: { min: 50 },
        },
        fetchedEntries: {
          tools: [],
          guidelines: [
            { entry: lowPriority, scopeIndex: 0 },
            { entry: highPriority, scopeIndex: 0 },
          ],
          knowledge: [],
          experiences: [],
        },
      });

      const result = filterStage(ctx);

      expect(result.filtered.guidelines).toHaveLength(1);
      expect(result.filtered.guidelines[0].entry.id).toBe('guide-2');
    });

    it('should filter guidelines by maximum priority', () => {
      const lowPriority = createMockGuideline('guide-1', 'Low Priority', { priority: 20 });
      const highPriority = createMockGuideline('guide-2', 'High Priority', { priority: 80 });

      const ctx = createContext({
        params: {
          priority: { max: 50 },
        },
        fetchedEntries: {
          tools: [],
          guidelines: [
            { entry: lowPriority, scopeIndex: 0 },
            { entry: highPriority, scopeIndex: 0 },
          ],
          knowledge: [],
          experiences: [],
        },
      });

      const result = filterStage(ctx);

      expect(result.filtered.guidelines).toHaveLength(1);
      expect(result.filtered.guidelines[0].entry.id).toBe('guide-1');
    });

    it('should filter guidelines by priority range', () => {
      const veryLow = createMockGuideline('guide-1', 'Very Low', { priority: 10 });
      const mid = createMockGuideline('guide-2', 'Mid', { priority: 50 });
      const veryHigh = createMockGuideline('guide-3', 'Very High', { priority: 90 });

      const ctx = createContext({
        params: {
          priority: { min: 30, max: 70 },
        },
        fetchedEntries: {
          tools: [],
          guidelines: [
            { entry: veryLow, scopeIndex: 0 },
            { entry: mid, scopeIndex: 0 },
            { entry: veryHigh, scopeIndex: 0 },
          ],
          knowledge: [],
          experiences: [],
        },
      });

      const result = filterStage(ctx);

      expect(result.filtered.guidelines).toHaveLength(1);
      expect(result.filtered.guidelines[0].entry.id).toBe('guide-2');
    });

    it('should not apply priority filter to other entry types', () => {
      const tool = createMockTool('tool-1', 'Tool One');

      const ctx = createContext({
        params: {
          priority: { min: 50 },
        },
        fetchedEntries: {
          tools: [{ entry: tool, scopeIndex: 0 }],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
      });

      const result = filterStage(ctx);

      expect(result.filtered.tools).toHaveLength(1);
    });
  });

  describe('text search filtering', () => {
    it('should filter by text search', () => {
      const matchingTool = createMockTool('tool-1', 'TypeScript Helper');
      const nonMatchingTool = createMockTool('tool-2', 'Python Utility');

      const ctx = createContext({
        search: 'TypeScript',
        fetchedEntries: {
          tools: [
            { entry: matchingTool, scopeIndex: 0 },
            { entry: nonMatchingTool, scopeIndex: 0 },
          ],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
      });

      const result = filterStage(ctx);

      expect(result.filtered.tools).toHaveLength(1);
      expect(result.filtered.tools[0].entry.id).toBe('tool-1');
      expect(result.filtered.tools[0].textMatched).toBe(true);
    });

    it('should mark textMatched true when already passed FTS filter', () => {
      const tool = createMockTool('tool-1', 'Tool One');

      const ctx = createContext({
        search: 'tool',
        fetchedEntries: {
          tools: [{ entry: tool, scopeIndex: 0 }],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
        ftsMatchIds: {
          tool: new Set(['tool-1']),
          guideline: new Set(),
          knowledge: new Set(),
          experience: new Set(),
        },
      });

      const result = filterStage(ctx);

      expect(result.filtered.tools).toHaveLength(1);
      expect(result.filtered.tools[0].textMatched).toBe(true);
    });

    it('should allow semantic matches even without text match in hybrid mode', () => {
      const semanticMatch = createMockTool('tool-1', 'Completely Different Name');

      const ctx = createContext({
        search: 'typescript helper',
        searchStrategy: 'hybrid',
        fetchedEntries: {
          tools: [{ entry: semanticMatch, scopeIndex: 0 }],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
        semanticScores: new Map([['tool-1', 0.85]]),
      });

      const result = filterStage(ctx);

      expect(result.filtered.tools).toHaveLength(1);
      expect(result.filtered.tools[0].entry.id).toBe('tool-1');
    });
  });

  describe('stage completion', () => {
    it('should mark FILTER stage as completed', () => {
      const ctx = createContext();
      const result = filterStage(ctx);

      expect(result.completedStages.has('filter')).toBe(true);
    });

    it('should clear fetchedEntries to release memory', () => {
      const ctx = createContext({
        fetchedEntries: {
          tools: [{ entry: createMockTool('tool-1', 'Tool One'), scopeIndex: 0 }],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
      });

      const result = filterStage(ctx);

      expect(result.fetchedEntries.tools).toHaveLength(0);
    });
  });
});
