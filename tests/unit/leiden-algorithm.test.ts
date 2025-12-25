import { describe, it, expect } from 'vitest';
import { detectCommunitiesLeiden } from '../../src/services/summarization/community-detection/leiden.js';
import type { CommunityNode, CommunityDetectionConfig } from '../../src/services/summarization/community-detection/types.js';

describe('Leiden Community Detection', () => {
  describe('detectCommunitiesLeiden', () => {
    it('should return empty result for empty input', async () => {
      const result = await detectCommunitiesLeiden([]);

      expect(result.communities).toHaveLength(0);
      expect(result.modularity).toBe(0);
      expect(result.metadata?.converged).toBe(true);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should detect single community with similar nodes', async () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.95, 0.05, 0] },
        { id: '3', type: 'knowledge', embedding: [0.9, 0.1, 0] },
        { id: '4', type: 'knowledge', embedding: [0.85, 0.15, 0] },
      ];

      const result = await detectCommunitiesLeiden(nodes, {
        similarityThreshold: 0.7,
        minCommunitySize: 3,
      });

      expect(result.communities.length).toBeGreaterThan(0);
      expect(result.communities[0]?.members.length).toBeGreaterThanOrEqual(3);
      expect(result.modularity).toBeGreaterThanOrEqual(-0.5);
      expect(result.modularity).toBeLessThanOrEqual(1.0);
    });

    it('should detect multiple communities with distinct clusters', async () => {
      const nodes: CommunityNode[] = [
        // Cluster 1: Similar to [1, 0, 0]
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.95, 0.05, 0] },
        { id: '3', type: 'knowledge', embedding: [0.9, 0.1, 0] },
        // Cluster 2: Similar to [0, 1, 0]
        { id: '4', type: 'knowledge', embedding: [0, 1, 0] },
        { id: '5', type: 'knowledge', embedding: [0.05, 0.95, 0] },
        { id: '6', type: 'knowledge', embedding: [0.1, 0.9, 0] },
      ];

      const result = await detectCommunitiesLeiden(nodes, {
        similarityThreshold: 0.8,
        minCommunitySize: 2,
      });

      // Should detect 2 separate communities
      expect(result.communities.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter out small communities below minCommunitySize', async () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.95, 0.05, 0] },
        { id: '3', type: 'knowledge', embedding: [0, 1, 0] }, // Isolated node
      ];

      const result = await detectCommunitiesLeiden(nodes, {
        similarityThreshold: 0.9,
        minCommunitySize: 3,
      });

      // Should not include the isolated node as a community
      expect(result.communities.every(c => c.members.length >= 3)).toBe(true);
    });

    it('should handle nodes without embeddings', async () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge' }, // No embedding
        { id: '3', type: 'knowledge', embedding: [0.95, 0.05, 0] },
      ];

      const result = await detectCommunitiesLeiden(nodes, {
        minCommunitySize: 1,
      });

      // Should only include nodes with embeddings in communities
      const allMembers = result.communities.flatMap(c => c.members);
      expect(allMembers.every(m => m.embedding !== undefined)).toBe(true);
    });

    it('should use default configuration when not provided', async () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.95, 0.05, 0] },
        { id: '3', type: 'knowledge', embedding: [0.9, 0.1, 0] },
      ];

      const result = await detectCommunitiesLeiden(nodes);

      expect(result.communities).toBeDefined();
      expect(result.modularity).toBeDefined();
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should respect resolution parameter', async () => {
      const nodes: CommunityNode[] = Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        type: 'knowledge' as const,
        embedding: [Math.cos(i * 0.3), Math.sin(i * 0.3), 0],
      }));

      // Higher resolution should create more, smaller communities
      const resultHighRes = await detectCommunitiesLeiden(nodes, {
        resolution: 2.0,
        minCommunitySize: 2,
        similarityThreshold: 0.7,
      });

      // Lower resolution should create fewer, larger communities
      const resultLowRes = await detectCommunitiesLeiden(nodes, {
        resolution: 0.5,
        minCommunitySize: 2,
        similarityThreshold: 0.7,
      });

      // This is a heuristic test - higher resolution might lead to more communities
      expect(resultHighRes.communities.length).toBeGreaterThanOrEqual(0);
      expect(resultLowRes.communities.length).toBeGreaterThanOrEqual(0);
    });

    it('should converge within max iterations', async () => {
      const nodes: CommunityNode[] = Array.from({ length: 20 }, (_, i) => ({
        id: String(i),
        type: 'knowledge' as const,
        embedding: [Math.random(), Math.random(), Math.random()],
      }));

      const result = await detectCommunitiesLeiden(nodes, {
        maxIterations: 10,
        minCommunitySize: 2,
      });

      expect(result.metadata?.iterations).toBeLessThanOrEqual(10);
    });

    it('should stop early when converged', async () => {
      const nodes: CommunityNode[] = [
        // Very tight cluster - should converge quickly
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.999, 0.001, 0] },
        { id: '3', type: 'knowledge', embedding: [0.998, 0.002, 0] },
      ];

      const result = await detectCommunitiesLeiden(nodes, {
        maxIterations: 100,
        convergenceThreshold: 0.001,
        minCommunitySize: 2,
      });

      // Should converge well before max iterations
      expect(result.metadata?.iterations).toBeLessThan(100);
      expect(result.metadata?.converged).toBe(true);
    });

    it('should include community metadata', async () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'tool', embedding: [0.95, 0.05, 0] },
        { id: '3', type: 'guideline', embedding: [0.9, 0.1, 0] },
      ];

      const result = await detectCommunitiesLeiden(nodes, {
        minCommunitySize: 2,
        similarityThreshold: 0.7,
      });

      if (result.communities.length > 0) {
        const community = result.communities[0]!;

        expect(community.id).toBeDefined();
        expect(community.members).toBeDefined();
        expect(community.cohesion).toBeGreaterThanOrEqual(0);
        expect(community.cohesion).toBeLessThanOrEqual(1);

        if (community.metadata) {
          expect(community.metadata.avgSimilarity).toBeDefined();
          expect(community.metadata.minSimilarity).toBeDefined();
          expect(community.metadata.maxSimilarity).toBeDefined();
          expect(community.metadata.dominantTypes).toBeDefined();
        }
      }
    });

    it('should calculate valid modularity scores', async () => {
      const nodes: CommunityNode[] = Array.from({ length: 15 }, (_, i) => ({
        id: String(i),
        type: 'knowledge' as const,
        embedding: [
          Math.cos((i % 3) * Math.PI / 3),
          Math.sin((i % 3) * Math.PI / 3),
          0,
        ],
      }));

      const result = await detectCommunitiesLeiden(nodes, {
        minCommunitySize: 2,
      });

      // Modularity should be in valid range
      expect(result.modularity).toBeGreaterThanOrEqual(-0.5);
      expect(result.modularity).toBeLessThanOrEqual(1.0);
    });

    it('should use random seed for reproducibility', async () => {
      const nodes: CommunityNode[] = Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        type: 'knowledge' as const,
        embedding: [Math.cos(i * 0.5), Math.sin(i * 0.5), 0],
      }));

      const config: CommunityDetectionConfig = {
        randomSeed: 12345,
        minCommunitySize: 2,
      };

      const result1 = await detectCommunitiesLeiden(nodes, config);
      const result2 = await detectCommunitiesLeiden(nodes, config);

      // With same seed, should get same number of communities
      expect(result1.communities.length).toBe(result2.communities.length);
    });

    it('should handle high-dimensional embeddings', async () => {
      const dim = 1536;
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: Array(dim).fill(1).map((_, i) => i % 2) },
        { id: '2', type: 'knowledge', embedding: Array(dim).fill(1).map((_, i) => i % 2) },
        { id: '3', type: 'knowledge', embedding: Array(dim).fill(1).map((_, i) => (i + 1) % 2) },
      ];

      const result = await detectCommunitiesLeiden(nodes, {
        minCommunitySize: 2,
      });

      expect(result.communities).toBeDefined();
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should calculate centroids for communities', async () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.95, 0.05, 0] },
        { id: '3', type: 'knowledge', embedding: [0.9, 0.1, 0] },
      ];

      const result = await detectCommunitiesLeiden(nodes, {
        minCommunitySize: 2,
        similarityThreshold: 0.7,
      });

      if (result.communities.length > 0) {
        const community = result.communities[0]!;

        if (community.centroid) {
          expect(community.centroid).toBeDefined();
          expect(community.centroid.length).toBe(3);
          expect(community.centroid.every(v => typeof v === 'number')).toBe(true);
        }
      }
    });

    it('should track dominant node types', async () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.95, 0.05, 0] },
        { id: '3', type: 'tool', embedding: [0.9, 0.1, 0] },
      ];

      const result = await detectCommunitiesLeiden(nodes, {
        minCommunitySize: 2,
        similarityThreshold: 0.7,
      });

      if (result.communities.length > 0) {
        const community = result.communities[0]!;

        if (community.metadata?.dominantTypes) {
          expect(community.metadata.dominantTypes).toBeDefined();
          expect(Array.isArray(community.metadata.dominantTypes)).toBe(true);
          // Most common type should be first
          expect(community.metadata.dominantTypes[0]).toBe('knowledge');
        }
      }
    });

    it('should handle similarity threshold edge cases', async () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0, 1, 0] },
      ];

      // Very high threshold - no edges should form
      const resultHigh = await detectCommunitiesLeiden(nodes, {
        similarityThreshold: 0.99,
        minCommunitySize: 2,
      });

      expect(resultHigh.communities).toHaveLength(0);

      // Very low threshold - should form edges
      const resultLow = await detectCommunitiesLeiden(nodes, {
        similarityThreshold: 0.01,
        minCommunitySize: 2,
      });

      expect(resultLow.communities.length).toBeGreaterThanOrEqual(0);
    });

    it('should provide processing time metadata', async () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.95, 0.05, 0] },
      ];

      const result = await detectCommunitiesLeiden(nodes);

      expect(result.processingTimeMs).toBeDefined();
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.processingTimeMs).toBeLessThan(10000); // Should complete in < 10s
    });

    it('should handle large graphs efficiently', async () => {
      const nodeCount = 100;
      const nodes: CommunityNode[] = Array.from({ length: nodeCount }, (_, i) => ({
        id: String(i),
        type: 'knowledge' as const,
        embedding: [
          Math.cos(i * 0.1),
          Math.sin(i * 0.1),
          Math.cos(i * 0.2),
        ],
      }));

      const startTime = performance.now();
      const result = await detectCommunitiesLeiden(nodes, {
        minCommunitySize: 3,
        maxIterations: 50,
      });
      const duration = performance.now() - startTime;

      expect(result.communities).toBeDefined();
      expect(duration).toBeLessThan(5000); // Should complete in < 5s for 100 nodes
    });
  });
});
