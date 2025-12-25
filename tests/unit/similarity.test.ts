import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  pairwiseSimilarities,
  computeCentroid,
  computeNodeCentroid,
  buildSimilarityGraph,
  calculateCohesion,
  calculateDetailedCohesion,
} from '../../src/services/summarization/community-detection/similarity.js';
import type { CommunityNode } from '../../src/services/summarization/community-detection/types.js';

describe('Similarity Calculations', () => {
  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const vec = [1, 2, 3, 4];
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [0, 1, 0];
      expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(0.0, 5);
    });

    it('should return -1 for opposite vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [-1, 0, 0];
      expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(-1.0, 5);
    });

    it('should calculate similarity for normalized vectors', () => {
      // For normalized vectors, cosine similarity equals dot product
      const vec1 = [0.6, 0.8];
      const vec2 = [0.8, 0.6];
      const expected = 0.6 * 0.8 + 0.8 * 0.6;
      expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(expected, 5);
    });

    it('should handle zero vectors', () => {
      const zero = [0, 0, 0];
      const nonZero = [1, 2, 3];
      expect(cosineSimilarity(zero, nonZero)).toBe(0);
      expect(cosineSimilarity(zero, zero)).toBe(0);
    });

    it('should handle empty vectors', () => {
      expect(cosineSimilarity([], [])).toBe(0);
    });

    it('should throw error for dimension mismatch', () => {
      const vec1 = [1, 2, 3];
      const vec2 = [1, 2];
      expect(() => cosineSimilarity(vec1, vec2)).toThrow('dimension mismatch');
    });

    it('should handle high-dimensional vectors', () => {
      const dim = 1536;
      const vec1 = Array(dim).fill(1);
      const vec2 = Array(dim).fill(1);
      expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(1.0, 5);
    });

    it('should handle negative values', () => {
      const vec1 = [-1, -2, -3];
      const vec2 = [1, 2, 3];
      expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(-1.0, 5);
    });
  });

  describe('pairwiseSimilarities', () => {
    it('should calculate similarities for all nodes', () => {
      const node: CommunityNode = {
        id: '1',
        type: 'knowledge',
        embedding: [1, 0, 0],
      };

      const others: CommunityNode[] = [
        { id: '2', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '3', type: 'knowledge', embedding: [0, 1, 0] },
        { id: '4', type: 'knowledge', embedding: [-1, 0, 0] },
      ];

      const similarities = pairwiseSimilarities(node, others);

      expect(similarities).toHaveLength(3);
      expect(similarities[0]).toBeCloseTo(1.0, 5); // Same direction
      expect(similarities[1]).toBeCloseTo(0.0, 5); // Orthogonal
      expect(similarities[2]).toBeCloseTo(-1.0, 5); // Opposite
    });

    it('should return zeros for nodes without embeddings', () => {
      const node: CommunityNode = {
        id: '1',
        type: 'knowledge',
        // No embedding
      };

      const others: CommunityNode[] = [
        { id: '2', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '3', type: 'knowledge', embedding: [0, 1, 0] },
      ];

      const similarities = pairwiseSimilarities(node, others);
      expect(similarities).toEqual([0, 0]);
    });

    it('should return zeros when other nodes lack embeddings', () => {
      const node: CommunityNode = {
        id: '1',
        type: 'knowledge',
        embedding: [1, 0, 0],
      };

      const others: CommunityNode[] = [
        { id: '2', type: 'knowledge' },
        { id: '3', type: 'knowledge' },
      ];

      const similarities = pairwiseSimilarities(node, others);
      expect(similarities).toEqual([0, 0]);
    });

    it('should handle empty array of other nodes', () => {
      const node: CommunityNode = {
        id: '1',
        type: 'knowledge',
        embedding: [1, 0, 0],
      };

      const similarities = pairwiseSimilarities(node, []);
      expect(similarities).toEqual([]);
    });
  });

  describe('computeCentroid', () => {
    it('should compute average of embeddings', () => {
      const embeddings = [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ];

      const centroid = computeCentroid(embeddings);

      expect(centroid).toBeDefined();
      expect(centroid).toHaveLength(3);
      expect(centroid![0]).toBeCloseTo(4, 5); // (1+4+7)/3
      expect(centroid![1]).toBeCloseTo(5, 5); // (2+5+8)/3
      expect(centroid![2]).toBeCloseTo(6, 5); // (3+6+9)/3
    });

    it('should return undefined for empty embeddings', () => {
      expect(computeCentroid([])).toBeUndefined();
    });

    it('should filter out empty embeddings', () => {
      const embeddings = [
        [1, 2, 3],
        [],
        [3, 4, 5],
      ];

      const centroid = computeCentroid(embeddings);

      expect(centroid).toBeDefined();
      expect(centroid![0]).toBeCloseTo(2, 5); // (1+3)/2
      expect(centroid![1]).toBeCloseTo(3, 5); // (2+4)/2
      expect(centroid![2]).toBeCloseTo(4, 5); // (3+5)/2
    });

    it('should return undefined when all embeddings are empty', () => {
      const embeddings = [[], [], []];
      expect(computeCentroid(embeddings)).toBeUndefined();
    });

    it('should throw error for dimension mismatch', () => {
      const embeddings = [
        [1, 2, 3],
        [4, 5], // Different dimension
      ];

      expect(() => computeCentroid(embeddings)).toThrow('dimension mismatch');
    });

    it('should handle single embedding', () => {
      const embeddings = [[1, 2, 3]];
      const centroid = computeCentroid(embeddings);

      expect(centroid).toEqual([1, 2, 3]);
    });

    it('should handle high-dimensional embeddings', () => {
      const dim = 1536;
      const embeddings = [
        Array(dim).fill(1),
        Array(dim).fill(3),
      ];

      const centroid = computeCentroid(embeddings);

      expect(centroid).toHaveLength(dim);
      expect(centroid![0]).toBeCloseTo(2, 5);
    });
  });

  describe('computeNodeCentroid', () => {
    it('should compute centroid from nodes with embeddings', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 2, 3] },
        { id: '2', type: 'knowledge', embedding: [4, 5, 6] },
      ];

      const centroid = computeNodeCentroid(nodes);

      expect(centroid).toBeDefined();
      expect(centroid![0]).toBeCloseTo(2.5, 5);
      expect(centroid![1]).toBeCloseTo(3.5, 5);
      expect(centroid![2]).toBeCloseTo(4.5, 5);
    });

    it('should filter out nodes without embeddings', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 2, 3] },
        { id: '2', type: 'knowledge' }, // No embedding
        { id: '3', type: 'knowledge', embedding: [3, 4, 5] },
      ];

      const centroid = computeNodeCentroid(nodes);

      expect(centroid).toBeDefined();
      expect(centroid![0]).toBeCloseTo(2, 5);
    });

    it('should return undefined when no nodes have embeddings', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge' },
        { id: '2', type: 'knowledge' },
      ];

      expect(computeNodeCentroid(nodes)).toBeUndefined();
    });

    it('should handle empty node array', () => {
      expect(computeNodeCentroid([])).toBeUndefined();
    });
  });

  describe('buildSimilarityGraph', () => {
    it('should build graph with edges above threshold', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.9, 0.1, 0] }, // High similarity
        { id: '3', type: 'knowledge', embedding: [0, 1, 0] }, // Low similarity
      ];

      const graph = buildSimilarityGraph(nodes, 0.8);

      expect(graph.nodes).toHaveLength(3);
      expect(graph.edges.length).toBeGreaterThan(0);

      // Should have edge between node 1 and 2 (high similarity)
      const edge12 = graph.edges.find(
        e => (e.from === '1' && e.to === '2') || (e.from === '2' && e.to === '1')
      );
      expect(edge12).toBeDefined();
      expect(edge12!.weight).toBeGreaterThan(0.8);
    });

    it('should not create edges below threshold', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0, 1, 0] },
      ];

      const graph = buildSimilarityGraph(nodes, 0.9);

      expect(graph.edges).toHaveLength(0);
    });

    it('should filter out nodes without embeddings', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge' }, // No embedding
        { id: '3', type: 'knowledge', embedding: [0, 1, 0] },
      ];

      const graph = buildSimilarityGraph(nodes, 0.5);

      expect(graph.nodes).toHaveLength(2);
      expect(graph.nodes.every(n => n.embedding !== undefined)).toBe(true);
    });

    it('should create adjacency list for efficient traversal', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.9, 0.1, 0] },
      ];

      const graph = buildSimilarityGraph(nodes, 0.8);

      expect(graph.adjacencyList.has('1')).toBe(true);
      expect(graph.adjacencyList.has('2')).toBe(true);

      const neighbors1 = graph.adjacencyList.get('1')!;
      expect(neighbors1.length).toBeGreaterThan(0);
      expect(neighbors1[0]?.nodeId).toBe('2');
    });

    it('should calculate total weight correctly', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [1, 0, 0] },
      ];

      const graph = buildSimilarityGraph(nodes, 0.5);

      // Total weight should be sum of all edge weights (counted in both directions)
      expect(graph.totalWeight).toBeGreaterThan(0);
    });

    it('should handle empty node array', () => {
      const graph = buildSimilarityGraph([], 0.5);

      expect(graph.nodes).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
      expect(graph.totalWeight).toBe(0);
    });

    it('should handle single node', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
      ];

      const graph = buildSimilarityGraph(nodes, 0.5);

      expect(graph.nodes).toHaveLength(1);
      expect(graph.edges).toHaveLength(0);
    });
  });

  describe('calculateCohesion', () => {
    it('should return 1 for single node', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 2, 3] },
      ];

      expect(calculateCohesion(nodes)).toBe(1.0);
    });

    it('should return 1 for empty array', () => {
      expect(calculateCohesion([])).toBe(1.0);
    });

    it('should calculate average pairwise similarity', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '3', type: 'knowledge', embedding: [1, 0, 0] },
      ];

      // All identical vectors should have cohesion of 1
      expect(calculateCohesion(nodes)).toBeCloseTo(1.0, 5);
    });

    it('should calculate low cohesion for dissimilar nodes', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0, 1, 0] },
        { id: '3', type: 'knowledge', embedding: [0, 0, 1] },
      ];

      // Orthogonal vectors should have cohesion of 0
      expect(calculateCohesion(nodes)).toBeCloseTo(0.0, 5);
    });

    it('should handle nodes without embeddings', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge' },
        { id: '2', type: 'knowledge' },
      ];

      expect(calculateCohesion(nodes)).toBe(1.0);
    });

    it('should ignore nodes without embeddings in calculation', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge' }, // No embedding
        { id: '3', type: 'knowledge', embedding: [1, 0, 0] },
      ];

      // Should calculate based on nodes 1 and 3 only
      expect(calculateCohesion(nodes)).toBeCloseTo(1.0, 5);
    });
  });

  describe('calculateDetailedCohesion', () => {
    it('should return perfect cohesion for single node', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 2, 3] },
      ];

      const cohesion = calculateDetailedCohesion(nodes);

      expect(cohesion.avgSimilarity).toBe(1.0);
      expect(cohesion.minSimilarity).toBe(1.0);
      expect(cohesion.maxSimilarity).toBe(1.0);
    });

    it('should calculate detailed metrics', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.9, 0.1, 0] },
        { id: '3', type: 'knowledge', embedding: [0.8, 0.2, 0] },
      ];

      const cohesion = calculateDetailedCohesion(nodes);

      expect(cohesion.avgSimilarity).toBeGreaterThan(0.8);
      expect(cohesion.minSimilarity).toBeGreaterThan(0);
      expect(cohesion.maxSimilarity).toBeLessThanOrEqual(1.0);
      expect(cohesion.minSimilarity).toBeLessThanOrEqual(cohesion.avgSimilarity);
      expect(cohesion.avgSimilarity).toBeLessThanOrEqual(cohesion.maxSimilarity);
    });

    it('should handle nodes without embeddings', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge' },
        { id: '2', type: 'knowledge' },
      ];

      const cohesion = calculateDetailedCohesion(nodes);

      expect(cohesion.avgSimilarity).toBe(1.0);
      expect(cohesion.minSimilarity).toBe(1.0);
      expect(cohesion.maxSimilarity).toBe(1.0);
    });

    it('should handle empty array', () => {
      const cohesion = calculateDetailedCohesion([]);

      expect(cohesion.avgSimilarity).toBe(1.0);
      expect(cohesion.minSimilarity).toBe(1.0);
      expect(cohesion.maxSimilarity).toBe(1.0);
    });

    it('should track min and max correctly', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [1, 0, 0] }, // similarity = 1.0
        { id: '3', type: 'knowledge', embedding: [0, 1, 0] }, // similarity = 0.0 with others
      ];

      const cohesion = calculateDetailedCohesion(nodes);

      expect(cohesion.maxSimilarity).toBeCloseTo(1.0, 5);
      expect(cohesion.minSimilarity).toBeCloseTo(0.0, 5);
    });
  });
});
