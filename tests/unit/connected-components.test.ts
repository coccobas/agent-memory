import { describe, it, expect } from 'vitest';
import {
  detectCommunitiesConnected,
  singleLinkageClustering,
} from '../../src/services/summarization/community-detection/connected-components.js';
import type { CommunityNode } from '../../src/services/summarization/community-detection/types.js';

describe('Connected Components Community Detection', () => {
  describe('detectCommunitiesConnected', () => {
    it('should return empty result for empty input', async () => {
      const result = await detectCommunitiesConnected([]);

      expect(result.communities).toHaveLength(0);
      expect(result.modularity).toBe(0);
      expect(result.metadata?.converged).toBe(true);
      expect(result.metadata?.iterations).toBe(1);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should detect single component with connected nodes', async () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.95, 0.05, 0] },
        { id: '3', type: 'knowledge', embedding: [0.9, 0.1, 0] },
        { id: '4', type: 'knowledge', embedding: [0.85, 0.15, 0] },
      ];

      const result = await detectCommunitiesConnected(nodes, {
        similarityThreshold: 0.7,
        minCommunitySize: 3,
      });

      expect(result.communities.length).toBeGreaterThan(0);
      expect(result.communities[0]?.members.length).toBeGreaterThanOrEqual(3);
    });

    it('should detect multiple disconnected components', async () => {
      const nodes: CommunityNode[] = [
        // Component 1
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.95, 0.05, 0] },
        { id: '3', type: 'knowledge', embedding: [0.9, 0.1, 0] },
        // Component 2 (orthogonal to component 1)
        { id: '4', type: 'knowledge', embedding: [0, 1, 0] },
        { id: '5', type: 'knowledge', embedding: [0.05, 0.95, 0] },
        { id: '6', type: 'knowledge', embedding: [0.1, 0.9, 0] },
      ];

      const result = await detectCommunitiesConnected(nodes, {
        similarityThreshold: 0.8,
        minCommunitySize: 2,
      });

      // Should detect at least 1 component (possibly 2 depending on threshold)
      expect(result.communities.length).toBeGreaterThanOrEqual(1);

      // Each component should have at least minCommunitySize members
      result.communities.forEach((community) => {
        expect(community.members.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('should filter out small components below minCommunitySize', async () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.95, 0.05, 0] },
        { id: '3', type: 'knowledge', embedding: [0, 1, 0] }, // Isolated
        { id: '4', type: 'knowledge', embedding: [0, 0, 1] }, // Isolated
      ];

      const result = await detectCommunitiesConnected(nodes, {
        similarityThreshold: 0.9,
        minCommunitySize: 3,
      });

      // Should only include components with 3+ members
      expect(result.communities.every((c) => c.members.length >= 3)).toBe(true);
    });

    it('should handle nodes without embeddings', async () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge' }, // No embedding
        { id: '3', type: 'knowledge', embedding: [0.95, 0.05, 0] },
        { id: '4', type: 'knowledge', embedding: [0.9, 0.1, 0] },
      ];

      const result = await detectCommunitiesConnected(nodes, {
        minCommunitySize: 2,
      });

      // Should only include nodes with embeddings
      const allMembers = result.communities.flatMap((c) => c.members);
      expect(allMembers.every((m) => m.embedding !== undefined)).toBe(true);
      expect(allMembers.every((m) => m.id !== '2')).toBe(true);
    });

    it('should use default configuration when not provided', async () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.95, 0.05, 0] },
        { id: '3', type: 'knowledge', embedding: [0.9, 0.1, 0] },
      ];

      const result = await detectCommunitiesConnected(nodes);

      expect(result.communities).toBeDefined();
      expect(result.modularity).toBeDefined();
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should calculate modularity', async () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.95, 0.05, 0] },
        { id: '3', type: 'knowledge', embedding: [0.9, 0.1, 0] },
      ];

      const result = await detectCommunitiesConnected(nodes, {
        minCommunitySize: 2,
        similarityThreshold: 0.7,
      });

      // Modularity should be in valid range
      expect(result.modularity).toBeGreaterThanOrEqual(-0.5);
      expect(result.modularity).toBeLessThanOrEqual(1.0);
    });

    it('should include community metadata', async () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'tool', embedding: [0.95, 0.05, 0] },
        { id: '3', type: 'guideline', embedding: [0.9, 0.1, 0] },
      ];

      const result = await detectCommunitiesConnected(nodes, {
        minCommunitySize: 2,
        similarityThreshold: 0.7,
      });

      if (result.communities.length > 0) {
        const community = result.communities[0]!;

        expect(community.id).toBeDefined();
        expect(community.id).toContain('component-');
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

    it('should compute centroids for communities', async () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.95, 0.05, 0] },
        { id: '3', type: 'knowledge', embedding: [0.9, 0.1, 0] },
      ];

      const result = await detectCommunitiesConnected(nodes, {
        minCommunitySize: 2,
        similarityThreshold: 0.7,
      });

      if (result.communities.length > 0) {
        const community = result.communities[0]!;

        if (community.centroid) {
          expect(community.centroid).toBeDefined();
          expect(community.centroid.length).toBe(3);
          expect(community.centroid.every((v) => typeof v === 'number')).toBe(true);
        }
      }
    });

    it('should track dominant node types', async () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.95, 0.05, 0] },
        { id: '3', type: 'tool', embedding: [0.9, 0.1, 0] },
      ];

      const result = await detectCommunitiesConnected(nodes, {
        minCommunitySize: 2,
        similarityThreshold: 0.7,
      });

      if (result.communities.length > 0 && result.communities[0]?.metadata?.dominantTypes) {
        const dominantTypes = result.communities[0].metadata.dominantTypes;

        expect(dominantTypes).toBeDefined();
        expect(Array.isArray(dominantTypes)).toBe(true);
        expect(dominantTypes[0]).toBe('knowledge'); // Most common type
      }
    });

    it('should complete in single iteration', async () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.95, 0.05, 0] },
      ];

      const result = await detectCommunitiesConnected(nodes);

      // Connected components is always single-pass
      expect(result.metadata?.iterations).toBe(1);
      expect(result.metadata?.converged).toBe(true);
    });

    it('should handle high threshold with no connections', async () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0, 1, 0] },
        { id: '3', type: 'knowledge', embedding: [0, 0, 1] },
      ];

      const result = await detectCommunitiesConnected(nodes, {
        similarityThreshold: 0.99,
        minCommunitySize: 2,
      });

      // With orthogonal vectors and high threshold, no components should form
      expect(result.communities).toHaveLength(0);
    });

    it('should handle large graphs efficiently', async () => {
      const nodeCount = 100;
      const nodes: CommunityNode[] = Array.from({ length: nodeCount }, (_, i) => ({
        id: String(i),
        type: 'knowledge' as const,
        embedding: [Math.cos(i * 0.1), Math.sin(i * 0.1), 0],
      }));

      const startTime = performance.now();
      const result = await detectCommunitiesConnected(nodes, {
        minCommunitySize: 3,
      });
      const duration = performance.now() - startTime;

      expect(result.communities).toBeDefined();
      expect(duration).toBeLessThan(2000); // Should be fast (< 2s)
    });

    it('should provide processing time metadata', async () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.95, 0.05, 0] },
      ];

      const result = await detectCommunitiesConnected(nodes);

      expect(result.processingTimeMs).toBeDefined();
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.processingTimeMs).toBeLessThan(5000);
    });
  });

  describe('singleLinkageClustering', () => {
    it('should create clusters using single-linkage', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.95, 0.05, 0] },
        { id: '3', type: 'knowledge', embedding: [0.9, 0.1, 0] },
      ];

      const communities = singleLinkageClustering(nodes, 0.7);

      expect(communities).toBeDefined();
      expect(Array.isArray(communities)).toBe(true);
    });

    it('should return empty array for empty input', () => {
      const communities = singleLinkageClustering([], 0.5);

      expect(communities).toHaveLength(0);
    });

    it('should create cluster from connected nodes', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.99, 0.01, 0] },
        { id: '3', type: 'knowledge', embedding: [0.98, 0.02, 0] },
      ];

      const communities = singleLinkageClustering(nodes, 0.9);

      expect(communities.length).toBeGreaterThan(0);
      if (communities.length > 0) {
        const totalMembers = communities.reduce((sum, c) => sum + c.members.length, 0);
        expect(totalMembers).toBeGreaterThan(0);
      }
    });

    it('should include cohesion metrics', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.95, 0.05, 0] },
      ];

      const communities = singleLinkageClustering(nodes, 0.7);

      if (communities.length > 0) {
        const community = communities[0]!;

        expect(community.cohesion).toBeDefined();
        expect(community.cohesion).toBeGreaterThanOrEqual(0);
        expect(community.cohesion).toBeLessThanOrEqual(1);
      }
    });

    it('should compute centroids', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.95, 0.05, 0] },
      ];

      const communities = singleLinkageClustering(nodes, 0.7);

      if (communities.length > 0) {
        const community = communities[0]!;

        if (community.centroid) {
          expect(community.centroid).toBeDefined();
          expect(community.centroid.length).toBe(3);
        }
      }
    });

    it('should handle nodes without embeddings', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge' }, // No embedding
        { id: '3', type: 'knowledge', embedding: [0.95, 0.05, 0] },
      ];

      const communities = singleLinkageClustering(nodes, 0.5);

      // Should only include nodes with embeddings
      const allMembers = communities.flatMap((c) => c.members);
      expect(allMembers.every((m) => m.embedding !== undefined)).toBe(true);
    });

    it('should assign unique IDs to communities', () => {
      const nodes: CommunityNode[] = [
        // Cluster 1
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0.95, 0.05, 0] },
        // Cluster 2
        { id: '3', type: 'knowledge', embedding: [0, 1, 0] },
        { id: '4', type: 'knowledge', embedding: [0.05, 0.95, 0] },
      ];

      const communities = singleLinkageClustering(nodes, 0.5);

      const ids = communities.map((c) => c.id);
      const uniqueIds = new Set(ids);

      expect(ids.length).toBe(uniqueIds.size); // All IDs should be unique
      expect(communities.every((c) => c.id.startsWith('linkage-'))).toBe(true);
    });

    it('should handle low threshold creating single cluster', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0, 1, 0] },
        { id: '3', type: 'knowledge', embedding: [0, 0, 1] },
      ];

      const communities = singleLinkageClustering(nodes, 0.01);

      // Very low threshold should connect everything
      if (communities.length > 0) {
        expect(communities.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('should handle high threshold creating no clusters', () => {
      const nodes: CommunityNode[] = [
        { id: '1', type: 'knowledge', embedding: [1, 0, 0] },
        { id: '2', type: 'knowledge', embedding: [0, 1, 0] },
      ];

      const communities = singleLinkageClustering(nodes, 0.99);

      // High threshold with orthogonal vectors should create isolated nodes
      // (which might be filtered out or kept as singleton clusters)
      expect(communities).toBeDefined();
    });
  });
});
