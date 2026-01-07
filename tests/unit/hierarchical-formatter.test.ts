import { describe, it, expect } from 'vitest';
import { formatHierarchicalContext } from '../../src/services/context/hierarchical-formatter.js';
import type { QueryResultItem } from '../../src/services/query/pipeline.js';
import type { ScopeType, Tag } from '../../src/db/schema.js';

// Helper to create mock result items
function createMockGuideline(
  id: string,
  name: string,
  priority: number,
  category?: string,
  createdAt?: string
): QueryResultItem {
  return {
    type: 'guideline',
    id,
    scopeType: 'project' as ScopeType,
    scopeId: 'proj-123',
    tags: [] as Tag[],
    score: 1.0,
    guideline: {
      id,
      name,
      priority,
      category: category ?? null,
      scopeType: 'project' as ScopeType,
      scopeId: 'proj-123',
      isActive: true,
      createdAt: createdAt || '2024-01-01T00:00:00Z',
      createdBy: 'agent-1',
      currentVersionId: null,
      lastAccessedAt: null,
      accessCount: 0,
    },
    version: {
      content: `Content for ${name}. This is a longer description.`,
      rationale: 'Test rationale',
    },
  };
}

function createMockKnowledge(
  id: string,
  title: string,
  category?: string,
  createdAt?: string
): QueryResultItem {
  return {
    type: 'knowledge',
    id,
    scopeType: 'project' as ScopeType,
    scopeId: 'proj-123',
    tags: [] as Tag[],
    score: 1.0,
    knowledge: {
      id,
      title,
      category: category ?? null,
      scopeType: 'project' as ScopeType,
      scopeId: 'proj-123',
      isActive: true,
      createdAt: createdAt || '2024-01-01T00:00:00Z',
      createdBy: 'agent-1',
      currentVersionId: null,
      lastAccessedAt: null,
      accessCount: 0,
      confidence: null,
      source: null,
      validFrom: null,
      validUntil: null,
      invalidatedBy: null,
    },
    version: {
      content: `Knowledge content for ${title}. More details here.`,
    },
  };
}

function createMockTool(
  id: string,
  name: string,
  category?: 'mcp' | 'cli' | 'function' | 'api',
  createdAt?: string
): QueryResultItem {
  return {
    type: 'tool',
    id,
    scopeType: 'project' as ScopeType,
    scopeId: 'proj-123',
    tags: [] as Tag[],
    score: 1.0,
    tool: {
      id,
      name,
      category: category ?? null,
      scopeType: 'project' as ScopeType,
      scopeId: 'proj-123',
      isActive: true,
      createdAt: createdAt || '2024-01-01T00:00:00Z',
      createdBy: 'agent-1',
      currentVersionId: null,
      lastAccessedAt: null,
      accessCount: 0,
    },
    version: {
      description: `Description for ${name} tool.`,
    },
  };
}

describe('Hierarchical Formatter', () => {
  describe('formatHierarchicalContext', () => {
    it('should return correct structure with empty results', () => {
      const result = formatHierarchicalContext([], 'project', 'proj-123');

      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('critical');
      expect(result).toHaveProperty('recent');
      expect(result).toHaveProperty('categories');
      expect(result).toHaveProperty('expand');
      expect(result).toHaveProperty('meta');

      expect(result.summary.totalEntries).toBe(0);
      expect(result.critical).toHaveLength(0);
      expect(result.recent).toHaveLength(0);
      expect(result.categories).toHaveLength(0);
    });

    it('should build correct summary counts', () => {
      const results: QueryResultItem[] = [
        createMockGuideline('g1', 'Guideline 1', 50, 'security'),
        createMockGuideline('g2', 'Guideline 2', 80, 'security'),
        createMockKnowledge('k1', 'Knowledge 1', 'decision'),
        createMockTool('t1', 'Tool 1', 'cli'),
      ];

      const result = formatHierarchicalContext(results, 'project', 'proj-123');

      expect(result.summary.totalEntries).toBe(4);
      expect(result.summary.byType).toEqual({
        guideline: 2,
        knowledge: 1,
        tool: 1,
      });
      expect(result.summary.byCategory).toEqual({
        security: 2,
        decision: 1,
        cli: 1,
      });
    });

    it('should extract critical items (priority >= 90)', () => {
      const results: QueryResultItem[] = [
        createMockGuideline('g1', 'Critical Guideline', 100, 'security'),
        createMockGuideline('g2', 'Important Guideline', 90, 'workflow'),
        createMockGuideline('g3', 'Normal Guideline', 50),
        createMockKnowledge('k1', 'Some Knowledge', 'fact'),
      ];

      const result = formatHierarchicalContext(results, 'project', 'proj-123');

      expect(result.critical).toHaveLength(2);
      expect(result.critical[0].title).toBe('Critical Guideline');
      expect(result.critical[0].priority).toBe(100);
      expect(result.critical[1].title).toBe('Important Guideline');
      expect(result.critical[1].priority).toBe(90);
    });

    it('should extract recent items sorted by createdAt', () => {
      const results: QueryResultItem[] = [
        createMockGuideline('g1', 'Old Guideline', 50, 'style', '2024-01-01T00:00:00Z'),
        createMockKnowledge('k1', 'New Knowledge', 'fact', '2024-06-15T12:00:00Z'),
        createMockTool('t1', 'Recent Tool', 'cli', '2024-06-10T08:00:00Z'),
      ];

      const result = formatHierarchicalContext(results, 'project', 'proj-123');

      expect(result.recent).toHaveLength(3);
      expect(result.recent[0].title).toBe('New Knowledge');
      expect(result.recent[1].title).toBe('Recent Tool');
      expect(result.recent[2].title).toBe('Old Guideline');
    });

    it('should extract unique categories', () => {
      const results: QueryResultItem[] = [
        createMockGuideline('g1', 'Guideline 1', 50, 'security'),
        createMockGuideline('g2', 'Guideline 2', 60, 'workflow'),
        createMockGuideline('g3', 'Guideline 3', 70, 'security'), // duplicate
        createMockKnowledge('k1', 'Knowledge 1', 'decision'),
      ];

      const result = formatHierarchicalContext(results, 'project', 'proj-123');

      expect(result.categories).toEqual(['decision', 'security', 'workflow']);
    });

    it('should build correct expand actions', () => {
      const result = formatHierarchicalContext([], 'project', 'proj-123');

      expect(result.expand.byCategory.tool).toBe('memory_query');
      expect(result.expand.byCategory.example).toHaveProperty('action', 'search');
      expect(result.expand.byCategory.example).toHaveProperty('scopeType', 'project');
      expect(result.expand.byCategory.example).toHaveProperty('scopeId', 'proj-123');

      expect(result.expand.bySearch.tool).toBe('memory_query');
      expect(result.expand.fullContext.example).toHaveProperty('hierarchical', false);
    });

    it('should handle global scope without scopeId', () => {
      const result = formatHierarchicalContext([], 'global', null);

      expect(result.meta.scopeType).toBe('global');
      expect(result.meta.scopeId).toBeNull();
      expect(result.expand.byCategory.example).not.toHaveProperty('scopeId');
    });

    it('should limit critical items to 5', () => {
      const results: QueryResultItem[] = Array.from({ length: 10 }, (_, i) =>
        createMockGuideline(`g${i}`, `Critical ${i}`, 100 - i, 'security')
      );

      const result = formatHierarchicalContext(results, 'project', 'proj-123');

      expect(result.critical).toHaveLength(5);
      expect(result.critical[0].priority).toBe(100);
    });

    it('should limit recent items to 5', () => {
      const results: QueryResultItem[] = Array.from({ length: 10 }, (_, i) =>
        createMockKnowledge(`k${i}`, `Knowledge ${i}`, 'fact', `2024-0${i + 1}-01T00:00:00Z`)
      );

      const result = formatHierarchicalContext(results, 'project', 'proj-123');

      expect(result.recent).toHaveLength(5);
    });

    it('should generate snippets from version content', () => {
      const results: QueryResultItem[] = [
        createMockGuideline('g1', 'Long Content Guideline', 95, 'style'),
      ];

      const result = formatHierarchicalContext(results, 'project', 'proj-123');

      expect(result.critical[0].snippet).toBeTruthy();
      expect(result.critical[0].snippet.length).toBeLessThanOrEqual(160);
    });

    it('should include token savings in meta', () => {
      const result = formatHierarchicalContext([], 'project', 'proj-123');

      expect(result.meta.tokenSavings).toContain('90%');
    });
  });
});
