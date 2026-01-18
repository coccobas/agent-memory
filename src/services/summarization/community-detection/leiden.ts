/**
 * Leiden Community Detection Algorithm
 *
 * Implements a simplified version of the Leiden algorithm for community detection.
 * The Leiden algorithm is an improvement over the Louvain algorithm with better
 * guarantees on community quality.
 *
 * Reference: Traag, V.A., Waltman, L. & van Eck, N.J. "From Louvain to Leiden:
 * guaranteeing well-connected communities." Sci Rep 9, 5233 (2019).
 *
 * NOTE: Non-null assertions used for Map/Set access after validation in graph algorithms.
 */

import type {
  CommunityNode,
  CommunityDetectionResult,
  CommunityDetectionConfig,
  Community,
  AdjacencyList,
} from './types.js';
import {
  computeNodeCentroid,
  calculateDetailedCohesion,
  // Bug #210: calculateCohesion removed - use detailedCohesion.avgSimilarity instead
} from './similarity.js';
import { buildSimilarityGraphAdaptive } from './ann-similarity.js'; // Bug #202 fix: O(n²) → O(n*k)

// =============================================================================
// TYPES
// =============================================================================

/**
 * Node assignment to communities
 * Maps node ID to community ID
 */
type CommunityAssignment = Map<string, string>;

/**
 * Community structure
 * Maps community ID to set of node IDs
 */
type CommunityStructure = Map<string, Set<string>>;

// =============================================================================
// MODULARITY CALCULATION
// =============================================================================

/**
 * Calculate modularity of a community partition
 *
 * Modularity measures the quality of a network partition by comparing
 * the density of edges within communities to the expected density in
 * a random network.
 *
 * Q = (1/2m) * Σ[A_ij - (k_i * k_j)/(2m)] * δ(c_i, c_j)
 *
 * Where:
 * - m is total edge weight
 * - A_ij is edge weight between nodes i and j
 * - k_i is sum of weights of edges connected to node i
 * - δ(c_i, c_j) is 1 if nodes i and j are in the same community
 *
 * @param adjacencyList Graph adjacency list
 * @param assignment Node to community assignments
 * @param totalWeight Total edge weight in graph
 * @param resolution Resolution parameter (default 1.0)
 * @returns Modularity score (range: -0.5 to 1.0)
 */
/**
 * Bug #205 fix: Pre-compute node degrees once and reuse.
 * Degrees are the sum of edge weights for each node and don't change
 * during the algorithm since the graph structure is fixed.
 */
function computeNodeDegrees(adjacencyList: AdjacencyList): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const [nodeId, neighbors] of adjacencyList) {
    const degree = neighbors.reduce((sum, n) => sum + n.weight, 0);
    degrees.set(nodeId, degree);
  }
  return degrees;
}

/**
 * Calculate modularity of a partition.
 *
 * Bug #205 fix: Now accepts pre-computed degrees to avoid redundant calculation.
 */
function calculateModularity(
  adjacencyList: AdjacencyList,
  assignment: CommunityAssignment,
  totalWeight: number,
  resolution: number,
  degrees: Map<string, number> // Bug #205: Use pre-computed degrees
): number {
  if (totalWeight === 0) {
    return 0;
  }

  let modularity = 0;

  // Calculate modularity using pre-computed degrees
  for (const [nodeId, neighbors] of adjacencyList) {
    const communityI = assignment.get(nodeId);
    const degreeI = degrees.get(nodeId) || 0;

    for (const { nodeId: neighborId, weight } of neighbors) {
      const communityJ = assignment.get(neighborId);

      // Only count if in same community
      if (communityI === communityJ) {
        const degreeJ = degrees.get(neighborId) || 0;
        const expectedWeight = (degreeI * degreeJ) / totalWeight;
        modularity += weight - resolution * expectedWeight;
      }
    }
  }

  // Normalize by total edge weight (divide by 2m, but we counted each edge twice)
  return modularity / totalWeight;
}

// =============================================================================
// LEIDEN ALGORITHM
// =============================================================================

/**
 * Initialize community assignments (each node starts in its own community)
 */
function initializeAssignments(nodeIds: string[]): CommunityAssignment {
  const assignment = new Map<string, string>();
  for (const nodeId of nodeIds) {
    assignment.set(nodeId, nodeId); // Use node ID as initial community ID
  }
  return assignment;
}

/**
 * Build community structure from assignments
 */
function buildCommunityStructure(assignment: CommunityAssignment): CommunityStructure {
  const structure = new Map<string, Set<string>>();

  for (const [nodeId, communityId] of assignment) {
    if (!structure.has(communityId)) {
      structure.set(communityId, new Set());
    }
    const communitySet = structure.get(communityId);
    if (communitySet) {
      communitySet.add(nodeId);
    }
  }

  return structure;
}

/**
 * Bug #203/#204 fix: Pre-computed community degree sums for O(1) lookup.
 * This avoids the O(n) scan over all assignments in calculateModularityGain.
 */
type CommunityDegreeSums = Map<string, number>;

/**
 * Initialize community degree sums from assignments and degrees.
 * Called once before the move phase, then updated incrementally.
 */
function initializeCommunityDegreeSums(
  assignment: CommunityAssignment,
  degrees: Map<string, number>
): CommunityDegreeSums {
  const sums = new Map<string, number>();
  for (const [nodeId, communityId] of assignment) {
    const degree = degrees.get(nodeId) || 0;
    sums.set(communityId, (sums.get(communityId) || 0) + degree);
  }
  return sums;
}

/**
 * Update community degree sums when a node moves to a new community.
 * O(1) operation instead of O(n) recalculation.
 */
function updateCommunityDegreeSums(
  sums: CommunityDegreeSums,
  _nodeId: string, // Unused but kept for consistency with other functions
  oldCommunityId: string,
  newCommunityId: string,
  nodeDegree: number
): void {
  // Remove from old community
  const oldSum = sums.get(oldCommunityId) || 0;
  sums.set(oldCommunityId, oldSum - nodeDegree);

  // Add to new community
  const newSum = sums.get(newCommunityId) || 0;
  sums.set(newCommunityId, newSum + nodeDegree);
}

/**
 * Calculate modularity gain from moving a node to a new community.
 *
 * Bug #203/#204 fix: Now uses pre-computed communityDegreeSums for O(1) lookup
 * instead of O(n) scan over all assignments. This changes the complexity from
 * O(n) per call to O(neighbors) per call.
 */
function calculateModularityGain(
  nodeId: string,
  newCommunityId: string,
  adjacencyList: AdjacencyList,
  assignment: CommunityAssignment,
  degrees: Map<string, number>,
  totalWeight: number,
  resolution: number,
  communityDegreeSums: CommunityDegreeSums // Bug #203/#204: Use cached sums
): number {
  const oldCommunityId = assignment.get(nodeId);
  if (!oldCommunityId || oldCommunityId === newCommunityId) {
    return 0;
  }

  const neighbors = adjacencyList.get(nodeId) || [];
  const nodeDegree = degrees.get(nodeId) || 0;

  let edgesToOldCommunity = 0;
  let edgesToNewCommunity = 0;

  // Calculate connections - O(neighbors)
  for (const { nodeId: neighborId, weight } of neighbors) {
    const neighborCommunity = assignment.get(neighborId);

    if (neighborCommunity === oldCommunityId) {
      edgesToOldCommunity += weight;
    }
    if (neighborCommunity === newCommunityId) {
      edgesToNewCommunity += weight;
    }
  }

  // Bug #203/#204 fix: O(1) lookup instead of O(n) scan
  // Note: oldCommunityDegree excludes the moving node
  const oldCommunityDegree = (communityDegreeSums.get(oldCommunityId) || 0) - nodeDegree;
  const newCommunityDegree = communityDegreeSums.get(newCommunityId) || 0;

  const m2 = totalWeight;
  const gain =
    edgesToNewCommunity -
    edgesToOldCommunity -
    (resolution * nodeDegree * (newCommunityDegree - oldCommunityDegree)) / m2;

  return gain;
}

/**
 * Move nodes locally to optimize modularity
 *
 * This is the core of the Leiden algorithm's "move" phase.
 *
 * Bug #203/#204 fix: Uses pre-computed community degree sums that are
 * updated incrementally when nodes move. This reduces complexity from
 * O(n²) to O(n × avg_neighbors).
 */
function moveNodesLocally(
  adjacencyList: AdjacencyList,
  assignment: CommunityAssignment,
  totalWeight: number,
  resolution: number,
  randomSeed: number
): { assignment: CommunityAssignment; improved: boolean } {
  let improved = false;

  // Calculate node degrees
  const degrees = new Map<string, number>();
  for (const [nodeId, neighbors] of adjacencyList) {
    const degree = neighbors.reduce((sum, n) => sum + n.weight, 0);
    degrees.set(nodeId, degree);
  }

  // Bug #203/#204 fix: Initialize community degree sums for O(1) lookup
  const communityDegreeSums = initializeCommunityDegreeSums(assignment, degrees);

  // Shuffle node order for randomization
  const nodeIds = Array.from(adjacencyList.keys());
  shuffleArray(nodeIds, randomSeed);

  // Try to move each node to a better community
  for (const nodeId of nodeIds) {
    const neighbors = adjacencyList.get(nodeId) || [];
    const currentCommunity = assignment.get(nodeId);
    if (!currentCommunity) continue;

    // Find neighboring communities
    const neighboringCommunities = new Set<string>();
    for (const { nodeId: neighborId } of neighbors) {
      const community = assignment.get(neighborId);
      if (community) {
        neighboringCommunities.add(community);
      }
    }

    // Find best community to move to
    let bestCommunity = currentCommunity;
    let bestGain = 0;

    for (const candidateCommunity of neighboringCommunities) {
      const gain = calculateModularityGain(
        nodeId,
        candidateCommunity,
        adjacencyList,
        assignment,
        degrees,
        totalWeight,
        resolution,
        communityDegreeSums // Bug #203/#204: Pass cached sums
      );

      if (gain > bestGain) {
        bestGain = gain;
        bestCommunity = candidateCommunity;
      }
    }

    // Move node if beneficial
    if (bestCommunity !== currentCommunity) {
      // Bug #203/#204 fix: Update cached sums incrementally - O(1) instead of O(n)
      const nodeDegree = degrees.get(nodeId) || 0;
      updateCommunityDegreeSums(
        communityDegreeSums,
        nodeId,
        currentCommunity,
        bestCommunity,
        nodeDegree
      );

      assignment.set(nodeId, bestCommunity);
      improved = true;
    }
  }

  return { assignment, improved };
}

/**
 * Simplified Leiden algorithm for community detection
 *
 * This implementation focuses on the core move phase of Leiden,
 * which iteratively moves nodes to optimize modularity.
 *
 * @param nodes Array of community nodes with embeddings
 * @param config Algorithm configuration
 * @returns Community detection result
 */
export async function detectCommunitiesLeiden(
  nodes: CommunityNode[],
  config?: CommunityDetectionConfig
): Promise<CommunityDetectionResult> {
  const startTime = performance.now();

  // Merge with defaults
  const cfg: Required<CommunityDetectionConfig> = {
    resolution: config?.resolution ?? 1.0,
    minCommunitySize: config?.minCommunitySize ?? 3,
    similarityThreshold: config?.similarityThreshold ?? 0.75,
    maxIterations: config?.maxIterations ?? 100,
    convergenceThreshold: config?.convergenceThreshold ?? 0.001,
    randomSeed: config?.randomSeed ?? 42,
  };

  // Build similarity graph (Bug #202 fix: uses LSH for large graphs)
  const graph = buildSimilarityGraphAdaptive(nodes, cfg.similarityThreshold);

  if (graph.nodes.length === 0) {
    return {
      communities: [],
      modularity: 0,
      processingTimeMs: performance.now() - startTime,
      metadata: {
        iterations: 0,
        converged: true,
        qualityDelta: 0,
      },
    };
  }

  // Initialize assignments
  let assignment = initializeAssignments(graph.nodes.map((n) => n.id));

  // Bug #205 fix: Pre-compute degrees once and reuse throughout algorithm
  const degrees = computeNodeDegrees(graph.adjacencyList);

  // Iteratively optimize
  let iteration = 0;
  let converged = false;
  let previousModularity = calculateModularity(
    graph.adjacencyList,
    assignment,
    graph.totalWeight,
    cfg.resolution,
    degrees // Bug #205: Pass pre-computed degrees
  );

  while (iteration < cfg.maxIterations && !converged) {
    const { assignment: newAssignment, improved } = moveNodesLocally(
      graph.adjacencyList,
      assignment,
      graph.totalWeight,
      cfg.resolution,
      cfg.randomSeed + iteration
    );

    assignment = newAssignment;

    const currentModularity = calculateModularity(
      graph.adjacencyList,
      assignment,
      graph.totalWeight,
      cfg.resolution,
      degrees // Bug #205: Pass pre-computed degrees
    );

    const qualityDelta = currentModularity - previousModularity;

    // Check convergence
    if (!improved || Math.abs(qualityDelta) < cfg.convergenceThreshold) {
      converged = true;
    }

    previousModularity = currentModularity;
    iteration++;
  }

  // Build final communities
  const structure = buildCommunityStructure(assignment);
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  const communities: Community[] = [];
  let communityIndex = 0;

  for (const [, memberIds] of structure) {
    const members = Array.from(memberIds)
      .map((id) => nodeMap.get(id))
      .filter((n): n is CommunityNode => n !== undefined);

    // Filter out communities smaller than minimum size
    if (members.length < cfg.minCommunitySize) {
      continue;
    }

    const centroid = computeNodeCentroid(members);
    // Bug #210 fix: Use detailedCohesion.avgSimilarity instead of separate calculateCohesion call
    // This avoids computing pairwise similarities twice (O(n²) operation)
    const detailedCohesion = calculateDetailedCohesion(members);
    const cohesion = detailedCohesion.avgSimilarity;

    // Count node types
    const typeCounts = new Map<string, number>();
    for (const member of members) {
      typeCounts.set(member.type, (typeCounts.get(member.type) || 0) + 1);
    }
    const dominantTypes = Array.from(typeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type]) => type) as CommunityNode['type'][];

    communities.push({
      id: `community-${communityIndex++}`,
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

  const finalModularity = calculateModularity(
    graph.adjacencyList,
    assignment,
    graph.totalWeight,
    cfg.resolution,
    degrees // Bug #205: Pass pre-computed degrees
  );

  return {
    communities,
    modularity: finalModularity,
    processingTimeMs: performance.now() - startTime,
    metadata: {
      iterations: iteration,
      converged,
      qualityDelta: finalModularity - previousModularity,
    },
  };
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Simple seeded shuffle using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[], seed: number): void {
  let currentSeed = seed;

  // Simple seeded random number generator
  const random = () => {
    currentSeed = (currentSeed * 9301 + 49297) % 233280;
    return currentSeed / 233280;
  };

  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const temp = array[i];
    const swapVal = array[j];
    if (temp !== undefined && swapVal !== undefined) {
      array[i] = swapVal;
      array[j] = temp;
    }
  }
}
