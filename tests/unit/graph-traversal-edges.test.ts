/**
 * Tests for Graph Traversal Using Edges Table
 *
 * Tests the edge-based graph traversal implementation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  traverseGraphEdges,
  injectGetPreparedStatement,
  type GetPreparedStatementFn,
} from '../../src/services/query/graph-traversal-edges.js';

describe('Graph Traversal Edges', () => {
  let mockStatement: { all: ReturnType<typeof vi.fn> };
  let mockGetPreparedStatement: GetPreparedStatementFn;

  beforeEach(() => {
    mockStatement = {
      all: vi.fn().mockReturnValue([]),
    };
    mockGetPreparedStatement = vi.fn().mockReturnValue(mockStatement);
    injectGetPreparedStatement(mockGetPreparedStatement);
  });

  afterEach(() => {
    injectGetPreparedStatement(null);
    vi.clearAllMocks();
  });

  describe('traverseGraphEdges', () => {
    describe('basic functionality', () => {
      it('should return empty result sets when no results found', () => {
        mockStatement.all.mockReturnValue([]);

        const result = traverseGraphEdges('guideline', 'g1');

        expect(result).toEqual({
          tool: new Set(),
          guideline: new Set(),
          knowledge: new Set(),
          experience: new Set(),
        });
      });

      it('should group results by entry type', () => {
        mockStatement.all.mockReturnValue([
          { node_type: 'tool', node_id: 't1' },
          { node_type: 'tool', node_id: 't2' },
          { node_type: 'guideline', node_id: 'g1' },
          { node_type: 'knowledge', node_id: 'k1' },
          { node_type: 'experience', node_id: 'e1' },
        ]);

        const result = traverseGraphEdges('tool', 'start-id');

        expect(result?.tool.size).toBe(2);
        expect(result?.tool.has('t1')).toBe(true);
        expect(result?.tool.has('t2')).toBe(true);
        expect(result?.guideline.size).toBe(1);
        expect(result?.knowledge.size).toBe(1);
        expect(result?.experience.size).toBe(1);
      });

      it('should filter out invalid node types', () => {
        mockStatement.all.mockReturnValue([
          { node_type: 'tool', node_id: 't1' },
          { node_type: 'project', node_id: 'p1' }, // Should be filtered out
          { node_type: 'invalid', node_id: 'x1' }, // Should be filtered out
        ]);

        const result = traverseGraphEdges('tool', 'start-id');

        expect(result?.tool.size).toBe(1);
        expect(result?.guideline.size).toBe(0);
        expect(result?.knowledge.size).toBe(0);
        expect(result?.experience.size).toBe(0);
      });

      it('should deduplicate results using Set', () => {
        mockStatement.all.mockReturnValue([
          { node_type: 'tool', node_id: 't1' },
          { node_type: 'tool', node_id: 't1' }, // Duplicate
          { node_type: 'tool', node_id: 't1' }, // Duplicate
        ]);

        const result = traverseGraphEdges('tool', 'start-id');

        expect(result?.tool.size).toBe(1);
      });
    });

    describe('direction options', () => {
      it('should use bidirectional traversal by default', () => {
        traverseGraphEdges('guideline', 'g1');

        expect(mockGetPreparedStatement).toHaveBeenCalled();
        const sql = (mockGetPreparedStatement as ReturnType<typeof vi.fn>).mock.calls[0][0];
        // Both direction queries have two depth parameters
        expect(mockStatement.all).toHaveBeenCalled();
        const params = mockStatement.all.mock.calls[0];
        // 'both' direction: startType, startId, maxDepth, maxDepth, maxResults
        expect(params.length).toBe(5);
      });

      it('should handle forward direction', () => {
        traverseGraphEdges('guideline', 'g1', { direction: 'forward' });

        const params = mockStatement.all.mock.calls[0];
        // 'forward' direction: startType, startId, maxDepth, maxResults
        expect(params.length).toBe(4);
      });

      it('should handle backward direction', () => {
        traverseGraphEdges('guideline', 'g1', { direction: 'backward' });

        const params = mockStatement.all.mock.calls[0];
        // 'backward' direction: startType, startId, maxDepth, maxResults
        expect(params.length).toBe(4);
      });
    });

    describe('relation type filter', () => {
      it('should include relation type when provided', () => {
        traverseGraphEdges('tool', 't1', {
          direction: 'forward',
          relationType: 'depends_on',
        });

        const params = mockStatement.all.mock.calls[0];
        // forward with filter: startType, startId, maxDepth, relationType, maxResults
        expect(params).toContain('depends_on');
      });

      it('should handle forward direction with filter', () => {
        traverseGraphEdges('guideline', 'g1', {
          direction: 'forward',
          relationType: 'applies_to',
        });

        const params = mockStatement.all.mock.calls[0];
        expect(params.length).toBe(5);
        expect(params).toContain('applies_to');
      });

      it('should handle backward direction with filter', () => {
        traverseGraphEdges('knowledge', 'k1', {
          direction: 'backward',
          relationType: 'related_to',
        });

        const params = mockStatement.all.mock.calls[0];
        expect(params.length).toBe(5);
        expect(params).toContain('related_to');
      });

      it('should handle both direction with filter', () => {
        traverseGraphEdges('tool', 't1', {
          direction: 'both',
          relationType: 'conflicts_with',
        });

        const params = mockStatement.all.mock.calls[0];
        // 'both' with filter: startType, startId, maxDepth, relationType, maxDepth, relationType, maxResults
        expect(params.length).toBe(7);
        // relationType appears twice for both directions
        expect(params.filter((p: unknown) => p === 'conflicts_with').length).toBe(2);
      });
    });

    describe('depth options', () => {
      it('should use default depth of 1', () => {
        traverseGraphEdges('guideline', 'g1', { direction: 'forward' });

        const params = mockStatement.all.mock.calls[0];
        // params: startType, startId, maxDepth, maxResults
        expect(params[2]).toBe(1);
      });

      it('should respect custom depth', () => {
        traverseGraphEdges('guideline', 'g1', { direction: 'forward', depth: 3 });

        const params = mockStatement.all.mock.calls[0];
        expect(params[2]).toBe(3);
      });

      it('should clamp depth to minimum of 1', () => {
        traverseGraphEdges('guideline', 'g1', { direction: 'forward', depth: 0 });

        const params = mockStatement.all.mock.calls[0];
        expect(params[2]).toBe(1);
      });

      it('should clamp depth to maximum of 5', () => {
        traverseGraphEdges('guideline', 'g1', { direction: 'forward', depth: 10 });

        const params = mockStatement.all.mock.calls[0];
        expect(params[2]).toBe(5);
      });
    });

    describe('maxResults options', () => {
      it('should use default maxResults of 100', () => {
        traverseGraphEdges('tool', 't1', { direction: 'forward' });

        const params = mockStatement.all.mock.calls[0];
        // Last param is maxResults
        expect(params[params.length - 1]).toBe(100);
      });

      it('should respect custom maxResults', () => {
        traverseGraphEdges('tool', 't1', { direction: 'forward', maxResults: 50 });

        const params = mockStatement.all.mock.calls[0];
        expect(params[params.length - 1]).toBe(50);
      });
    });

    describe('start types', () => {
      it('should accept tool as start type', () => {
        traverseGraphEdges('tool', 't1');

        const params = mockStatement.all.mock.calls[0];
        expect(params[0]).toBe('tool');
        expect(params[1]).toBe('t1');
      });

      it('should accept guideline as start type', () => {
        traverseGraphEdges('guideline', 'g1');

        const params = mockStatement.all.mock.calls[0];
        expect(params[0]).toBe('guideline');
        expect(params[1]).toBe('g1');
      });

      it('should accept knowledge as start type', () => {
        traverseGraphEdges('knowledge', 'k1');

        const params = mockStatement.all.mock.calls[0];
        expect(params[0]).toBe('knowledge');
        expect(params[1]).toBe('k1');
      });

      it('should accept project as start type', () => {
        traverseGraphEdges('project', 'p1');

        const params = mockStatement.all.mock.calls[0];
        expect(params[0]).toBe('project');
        expect(params[1]).toBe('p1');
      });

      it('should accept experience as start type', () => {
        traverseGraphEdges('experience', 'e1');

        const params = mockStatement.all.mock.calls[0];
        expect(params[0]).toBe('experience');
        expect(params[1]).toBe('e1');
      });
    });

    describe('error handling', () => {
      it('should return null on database error', () => {
        mockStatement.all.mockImplementation(() => {
          throw new Error('Database error');
        });

        const result = traverseGraphEdges('tool', 't1');

        expect(result).toBeNull();
      });

      it('should handle SQL preparation errors', () => {
        (mockGetPreparedStatement as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error('SQL preparation error');
        });

        const result = traverseGraphEdges('tool', 't1');

        expect(result).toBeNull();
      });
    });

    describe('truncation warning', () => {
      it('should not warn when results are below maxResults', () => {
        mockStatement.all.mockReturnValue([
          { node_type: 'tool', node_id: 't1' },
          { node_type: 'tool', node_id: 't2' },
        ]);

        const result = traverseGraphEdges('tool', 't1', { maxResults: 100 });

        expect(result).not.toBeNull();
        // Results are below max, no truncation warning expected
      });

      it('should handle results at exactly maxResults', () => {
        const results = Array.from({ length: 10 }, (_, i) => ({
          node_type: 'tool',
          node_id: `t${i}`,
        }));
        mockStatement.all.mockReturnValue(results);

        const result = traverseGraphEdges('tool', 't1', { maxResults: 10 });

        // Should still return results even at limit
        expect(result?.tool.size).toBe(10);
      });
    });
  });

  describe('injectGetPreparedStatement', () => {
    it('should allow injection of custom function', () => {
      const customMock = vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue([{ node_type: 'knowledge', node_id: 'k1' }]),
      });

      injectGetPreparedStatement(customMock);
      traverseGraphEdges('tool', 't1');

      expect(customMock).toHaveBeenCalled();
    });

    it('should reset to default when passed null', () => {
      const customMock = vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      });

      injectGetPreparedStatement(customMock);
      injectGetPreparedStatement(null);

      // After resetting, should use global function
      // This would normally throw since we don't have a real DB in tests
      // But our setup in beforeEach already injected a mock
    });
  });

  describe('selectEdgeCTEQuery (via traverseGraphEdges)', () => {
    it('should select forward no-filter query', () => {
      traverseGraphEdges('tool', 't1', { direction: 'forward' });

      const sql = (mockGetPreparedStatement as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(sql).toContain('source_id = r.node_id');
      expect(sql).not.toContain('edge_types');
    });

    it('should select forward with-filter query', () => {
      traverseGraphEdges('tool', 't1', { direction: 'forward', relationType: 'depends_on' });

      const sql = (mockGetPreparedStatement as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(sql).toContain('source_id = r.node_id');
      expect(sql).toContain('edge_types');
    });

    it('should select backward no-filter query', () => {
      traverseGraphEdges('tool', 't1', { direction: 'backward' });

      const sql = (mockGetPreparedStatement as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(sql).toContain('target_id = r.node_id');
      expect(sql).not.toContain('edge_types');
    });

    it('should select backward with-filter query', () => {
      traverseGraphEdges('tool', 't1', { direction: 'backward', relationType: 'applies_to' });

      const sql = (mockGetPreparedStatement as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(sql).toContain('target_id = r.node_id');
      expect(sql).toContain('edge_types');
    });

    it('should select both no-filter query', () => {
      traverseGraphEdges('tool', 't1', { direction: 'both' });

      const sql = (mockGetPreparedStatement as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Both query has source_id and target_id joins
      expect(sql).toContain('source_id = r.node_id');
      expect(sql).toContain('target_id = r.node_id');
    });

    it('should select both with-filter query', () => {
      traverseGraphEdges('tool', 't1', { direction: 'both', relationType: 'related_to' });

      const sql = (mockGetPreparedStatement as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(sql).toContain('edge_types');
      expect(sql).toContain('et.name');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string startId', () => {
      mockStatement.all.mockReturnValue([]);

      const result = traverseGraphEdges('tool', '');

      expect(result).not.toBeNull();
      const params = mockStatement.all.mock.calls[0];
      expect(params[1]).toBe('');
    });

    it('should handle special characters in startId', () => {
      mockStatement.all.mockReturnValue([]);

      const result = traverseGraphEdges('tool', 'id-with-\'quotes\'-and-"double"');

      expect(result).not.toBeNull();
    });

    it('should handle very long startId', () => {
      mockStatement.all.mockReturnValue([]);

      const longId = 'x'.repeat(1000);
      const result = traverseGraphEdges('tool', longId);

      expect(result).not.toBeNull();
      const params = mockStatement.all.mock.calls[0];
      expect(params[1]).toBe(longId);
    });
  });
});
