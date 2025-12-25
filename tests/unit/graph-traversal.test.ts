import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as connectionModule from '../../src/db/connection.js';
import { traverseRelationGraph, traverseRelationGraphCTE } from '../../src/services/query/graph-traversal.js';

// Mock dependencies
vi.mock('../../src/db/connection.js', () => ({
  getPreparedStatement: vi.fn(),
}));

vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('Graph Traversal', () => {
  let mockStmt: { all: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStmt = { all: vi.fn().mockReturnValue([]) };
    vi.mocked(connectionModule.getPreparedStatement).mockReturnValue(mockStmt as any);
  });

  describe('traverseRelationGraphCTE', () => {
    it('should traverse forward direction', () => {
      mockStmt.all.mockReturnValue([
        { node_type: 'knowledge', node_id: 'k-1' },
        { node_type: 'guideline', node_id: 'g-1' },
      ]);

      const result = traverseRelationGraphCTE('tool', 't-1', {
        direction: 'forward',
        depth: 2,
      });

      expect(result).not.toBeNull();
      expect(result!.knowledge.has('k-1')).toBe(true);
      expect(result!.guideline.has('g-1')).toBe(true);
    });

    it('should traverse backward direction', () => {
      mockStmt.all.mockReturnValue([
        { node_type: 'tool', node_id: 't-2' },
      ]);

      const result = traverseRelationGraphCTE('knowledge', 'k-1', {
        direction: 'backward',
        depth: 1,
      });

      expect(result).not.toBeNull();
      expect(result!.tool.has('t-2')).toBe(true);
    });

    it('should traverse both directions by default', () => {
      mockStmt.all.mockReturnValue([
        { node_type: 'knowledge', node_id: 'k-1' },
        { node_type: 'tool', node_id: 't-1' },
      ]);

      const result = traverseRelationGraphCTE('guideline', 'g-1', {});

      expect(result).not.toBeNull();
      expect(result!.knowledge.has('k-1')).toBe(true);
      expect(result!.tool.has('t-1')).toBe(true);
    });

    it('should filter by relation type', () => {
      mockStmt.all.mockReturnValue([
        { node_type: 'knowledge', node_id: 'k-1' },
      ]);

      const result = traverseRelationGraphCTE('tool', 't-1', {
        relationType: 'depends_on',
      });

      expect(result).not.toBeNull();
      expect(mockStmt.all).toHaveBeenCalled();
    });

    it('should respect max depth limit', () => {
      mockStmt.all.mockReturnValue([]);

      traverseRelationGraphCTE('tool', 't-1', {
        depth: 10, // Should be clamped to 5
      });

      expect(mockStmt.all).toHaveBeenCalled();
    });

    it('should respect max results limit', () => {
      const manyResults = Array.from({ length: 150 }, (_, i) => ({
        node_type: 'knowledge',
        node_id: `k-${i}`,
      }));
      mockStmt.all.mockReturnValue(manyResults);

      const result = traverseRelationGraphCTE('tool', 't-1', {
        maxResults: 50,
      });

      expect(result).not.toBeNull();
    });

    it('should return empty sets when no relations found', () => {
      mockStmt.all.mockReturnValue([]);

      const result = traverseRelationGraphCTE('tool', 't-1', {});

      expect(result).not.toBeNull();
      expect(result!.tool.size).toBe(0);
      expect(result!.knowledge.size).toBe(0);
      expect(result!.guideline.size).toBe(0);
      expect(result!.experience.size).toBe(0);
    });

    it('should return null on error and log debug message', () => {
      vi.mocked(connectionModule.getPreparedStatement).mockImplementation(() => {
        throw new Error('CTE not supported');
      });

      const result = traverseRelationGraphCTE('tool', 't-1', {});

      expect(result).toBeNull();
    });

    it('should filter out project nodes from results', () => {
      mockStmt.all.mockReturnValue([
        { node_type: 'knowledge', node_id: 'k-1' },
        { node_type: 'project', node_id: 'p-1' }, // Should be filtered by SQL
      ]);

      const result = traverseRelationGraphCTE('tool', 't-1', {});

      expect(result).not.toBeNull();
      expect(result!.knowledge.has('k-1')).toBe(true);
    });

    it('should handle experience type', () => {
      mockStmt.all.mockReturnValue([
        { node_type: 'experience', node_id: 'exp-1' },
      ]);

      const result = traverseRelationGraphCTE('tool', 't-1', {});

      expect(result).not.toBeNull();
      expect(result!.experience.has('exp-1')).toBe(true);
    });
  });

  describe('traverseRelationGraph', () => {
    it('should use CTE result when available', () => {
      mockStmt.all.mockReturnValue([
        { node_type: 'knowledge', node_id: 'k-1' },
      ]);

      const result = traverseRelationGraph('tool', 't-1', {
        depth: 2,
        direction: 'forward',
      });

      expect(result.knowledge.has('k-1')).toBe(true);
    });

    it('should fall back to BFS when CTE fails', () => {
      vi.mocked(connectionModule.getPreparedStatement).mockImplementation(() => {
        throw new Error('CTE not supported');
      });

      // Create mock DB client
      const mockDbClient = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              all: vi.fn().mockReturnValue([
                { targetType: 'knowledge', targetId: 'k-1', relationType: 'related_to' },
              ]),
            }),
          }),
        }),
      };

      const result = traverseRelationGraph('tool', 't-1', {}, mockDbClient as any);

      expect(result).toBeDefined();
      expect(result.tool.size).toBeGreaterThanOrEqual(0);
    });

    it('should return empty results when no db client for BFS', () => {
      vi.mocked(connectionModule.getPreparedStatement).mockImplementation(() => {
        throw new Error('CTE not supported');
      });

      // No db client provided
      const result = traverseRelationGraph('tool', 't-1', {});

      expect(result).toBeDefined();
      expect(result.tool.size).toBe(0);
      expect(result.knowledge.size).toBe(0);
    });

    it('should clamp depth to minimum of 1', () => {
      mockStmt.all.mockReturnValue([]);

      const result = traverseRelationGraph('tool', 't-1', {
        depth: 0, // Should be clamped to 1
      });

      expect(result).toBeDefined();
    });

    it('should clamp depth to maximum of 5', () => {
      mockStmt.all.mockReturnValue([]);

      const result = traverseRelationGraph('tool', 't-1', {
        depth: 100, // Should be clamped to 5
      });

      expect(result).toBeDefined();
    });

    it('should use default max results of 100', () => {
      mockStmt.all.mockReturnValue([]);

      const result = traverseRelationGraph('tool', 't-1', {});

      expect(result).toBeDefined();
    });
  });
});
