/**
 * Connected Components Community Detection
 *
 * Implements a simple connected components algorithm for community detection.
 * This serves as a fallback when the Leiden algorithm is overkill or when
 * dealing with sparse graphs.
 *
 * Uses Union-Find (Disjoint Set Union) data structure for efficient component detection.
 */

import type {
  CommunityNode,
  CommunityDetectionResult,
  CommunityDetectionConfig,
  Community,
} from './types.js';
import { calculateCohesion, computeNodeCentroid, calculateDetailedCohesion } from './similarity.js';
import { buildSimilarityGraphAdaptive } from './ann-similarity.js'; // Bug #202 fix

// =============================================================================
// UNION-FIND DATA STRUCTURE
// =============================================================================

/**
 * Union-Find data structure for efficient connected components detection
 *
 * Supports path compression and union by rank optimizations for
 * nearly O(1) amortized operations.
 */
class UnionFind {
  private parent: Map<string, string>;
  private rank: Map<string, number>;

  constructor(elements: string[]) {
    this.parent = new Map();
    this.rank = new Map();

    // Initialize each element as its own parent
    for (const element of elements) {
      this.parent.set(element, element);
      this.rank.set(element, 0);
    }
  }

  /**
   * Find the root of the set containing element (with path compression)
   */
  find(element: string): string {
    const parent = this.parent.get(element);
    if (!parent || parent === element) {
      return element;
    }

    // Path compression: make element point directly to root
    const root = this.find(parent);
    this.parent.set(element, root);
    return root;
  }

  /**
   * Union two sets (union by rank)
   */
  union(element1: string, element2: string): void {
    const root1 = this.find(element1);
    const root2 = this.find(element2);

    if (root1 === root2) {
      return; // Already in same set
    }

    const rank1 = this.rank.get(root1) || 0;
    const rank2 = this.rank.get(root2) || 0;

    // Union by rank: attach smaller tree under root of larger tree
    if (rank1 < rank2) {
      this.parent.set(root1, root2);
    } else if (rank1 > rank2) {
      this.parent.set(root2, root1);
    } else {
      this.parent.set(root2, root1);
      this.rank.set(root1, rank1 + 1);
    }
  }

  /**
   * Get all connected components
   *
   * @returns Map from component root to set of all members
   */
  getComponents(): Map<string, Set<string>> {
    const components = new Map<string, Set<string>>();

    for (const element of this.parent.keys()) {
      const root = this.find(element);

      if (!components.has(root)) {
        components.set(root, new Set());
      }
      const rootSet = components.get(root);
      if (rootSet) {
        rootSet.add(element);
      }
    }

    return components;
  }
}

// =============================================================================
// CONNECTED COMPONENTS ALGORITHM
// =============================================================================

/**
 * Detect communities using connected components algorithm
 *
 * This algorithm identifies communities by finding connected components in
 * the similarity graph. Two nodes are connected if their similarity exceeds
 * the threshold. This is simpler and faster than Leiden but may produce
 * less optimal communities.
 *
 * Best used when:
 * - Graph is sparse
 * - Clear separation between communities
 * - Speed is more important than optimal modularity
 *
 * @param nodes Array of community nodes with embeddings
 * @param config Algorithm configuration
 * @returns Community detection result
 */
export async function detectCommunitiesConnected(
  nodes: CommunityNode[],
  config?: CommunityDetectionConfig
): Promise<CommunityDetectionResult> {
  const startTime = performance.now();

  // Merge with defaults
  const cfg = {
    minCommunitySize: config?.minCommunitySize ?? 3,
    similarityThreshold: config?.similarityThreshold ?? 0.75,
  };

  // Build similarity graph
  const graph = buildSimilarityGraphAdaptive(nodes, cfg.similarityThreshold);

  if (graph.nodes.length === 0) {
    return {
      communities: [],
      modularity: 0,
      processingTimeMs: performance.now() - startTime,
      metadata: {
        iterations: 1,
        converged: true,
      },
    };
  }

  // Initialize union-find with all nodes
  const nodeIds = graph.nodes.map((n) => n.id);
  const unionFind = new UnionFind(nodeIds);

  // Union nodes that are connected (have edges between them)
  for (const edge of graph.edges) {
    unionFind.union(edge.from, edge.to);
  }

  // Get all connected components
  const components = unionFind.getComponents();

  // Build communities from components
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const communities: Community[] = [];
  let communityIndex = 0;

  for (const [, memberIds] of components) {
    const members = Array.from(memberIds)
      .map((id) => nodeMap.get(id))
      .filter((n): n is CommunityNode => n !== undefined);

    // Filter out communities smaller than minimum size
    if (members.length < cfg.minCommunitySize) {
      continue;
    }

    const centroid = computeNodeCentroid(members);
    const cohesion = calculateCohesion(members);
    const detailedCohesion = calculateDetailedCohesion(members);

    // Count node types
    const typeCounts = new Map<string, number>();
    for (const member of members) {
      typeCounts.set(member.type, (typeCounts.get(member.type) || 0) + 1);
    }
    const dominantTypes = Array.from(typeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type]) => type) as CommunityNode['type'][];

    communities.push({
      id: `component-${communityIndex++}`,
      members,
      centroid,
      cohesion,
      metadata: {
        avgSimilarity: detailedCohesion.avgSimilarity,
        minSimilarity: detailedCohesion.minSimilarity,
        maxSimilarity: detailedCohesion.maxSimilarity,
        dominantTypes,
      },
    });
  }

  // Calculate modularity (simple version for connected components)
  const modularity = calculateSimpleModularity(graph.adjacencyList, communities);

  return {
    communities,
    modularity,
    processingTimeMs: performance.now() - startTime,
    metadata: {
      iterations: 1, // Connected components is single-pass
      converged: true,
    },
  };
}

// =============================================================================
// MODULARITY CALCULATION
// =============================================================================

/**
 * Calculate simplified modularity for connected components
 *
 * This is a simplified version that works with the community structure
 * directly rather than node assignments.
 */
function calculateSimpleModularity(
  adjacencyList: Map<string, Array<{ nodeId: string; weight: number }>>,
  communities: Community[]
): number {
  // Build community membership map
  const membership = new Map<string, string>();
  for (const community of communities) {
    for (const member of community.members) {
      membership.set(member.id, community.id);
    }
  }

  // Calculate total edge weight
  let totalWeight = 0;
  for (const neighbors of adjacencyList.values()) {
    for (const { weight } of neighbors) {
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) {
    return 0;
  }

  // Calculate node degrees
  const degrees = new Map<string, number>();
  for (const [nodeId, neighbors] of adjacencyList) {
    const degree = neighbors.reduce((sum, n) => sum + n.weight, 0);
    degrees.set(nodeId, degree);
  }

  let modularity = 0;

  // Calculate modularity
  for (const [nodeId, neighbors] of adjacencyList) {
    const communityI = membership.get(nodeId);
    const degreeI = degrees.get(nodeId) || 0;

    for (const { nodeId: neighborId, weight } of neighbors) {
      const communityJ = membership.get(neighborId);

      // Only count if in same community
      if (communityI && communityI === communityJ) {
        const degreeJ = degrees.get(neighborId) || 0;
        const expectedWeight = (degreeI * degreeJ) / totalWeight;
        modularity += weight - expectedWeight;
      }
    }
  }

  return modularity / totalWeight;
}

// =============================================================================
// UTILITY: SINGLE-LINKAGE CLUSTERING
// =============================================================================

/**
 * Perform single-linkage hierarchical clustering as an alternative
 *
 * This can be useful for dendrograms or when you want a hierarchy of communities.
 * Not exported by default but available for advanced use cases.
 *
 * @param nodes Array of community nodes
 * @param threshold Similarity threshold for merging
 * @returns Communities formed by single-linkage clustering
 */
export function singleLinkageClustering(nodes: CommunityNode[], threshold: number): Community[] {
  // Build similarity graph
  const graph = buildSimilarityGraphAdaptive(nodes, threshold);

  if (graph.nodes.length === 0) {
    return [];
  }

  // Use union-find for single-linkage clustering
  const nodeIds = graph.nodes.map((n) => n.id);
  const unionFind = new UnionFind(nodeIds);

  // Sort edges by weight (descending) for better communities
  const sortedEdges = [...graph.edges].sort((a, b) => b.weight - a.weight);

  // Merge nodes with highest similarity first
  for (const edge of sortedEdges) {
    unionFind.union(edge.from, edge.to);
  }

  // Get components
  const components = unionFind.getComponents();
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const communities: Community[] = [];
  let communityIndex = 0;

  for (const memberIds of components.values()) {
    const members = Array.from(memberIds)
      .map((id) => nodeMap.get(id))
      .filter((n): n is CommunityNode => n !== undefined);

    if (members.length === 0) {
      continue;
    }

    const centroid = computeNodeCentroid(members);
    const cohesion = calculateCohesion(members);

    communities.push({
      id: `linkage-${communityIndex++}`,
      members,
      centroid,
      cohesion,
    });
  }

  return communities;
}
