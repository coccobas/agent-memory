/**
 * Community Detection for Hierarchical Summarization
 *
 * This module provides community detection algorithms for clustering memory entries
 * into communities for hierarchical summarization. Communities are groups of similar
 * entries that can be summarized together at higher levels of abstraction.
 *
 * Available algorithms:
 * - Leiden: Advanced algorithm optimizing modularity (recommended for most cases)
 * - Connected Components: Simple, fast algorithm for sparse graphs
 *
 * @module community-detection
 */

// Export types
export type {
  CommunityNode,
  CommunityNodeType,
  Community,
  CommunityDetectionResult,
  CommunityDetectionConfig,
  CommunityDetectionAlgorithm,
  CommunityDetectionFunction,
  SimilarityEdge,
  AdjacencyList,
  SimilarityGraph,
} from './types.js';

export { DEFAULT_COMMUNITY_DETECTION_CONFIG } from './types.js';

// Export similarity utilities
export {
  cosineSimilarity,
  pairwiseSimilarities,
  computeCentroid,
  computeNodeCentroid,
  buildSimilarityGraph,
  calculateCohesion,
  calculateDetailedCohesion,
} from './similarity.js';

// Export algorithm implementations
export { detectCommunitiesLeiden } from './leiden.js';
export { detectCommunitiesConnected, singleLinkageClustering } from './connected-components.js';

// Export main factory function
import type {
  CommunityNode,
  CommunityDetectionResult,
  CommunityDetectionConfig,
  CommunityDetectionAlgorithm,
} from './types.js';
import { detectCommunitiesLeiden } from './leiden.js';
import { detectCommunitiesConnected } from './connected-components.js';

/**
 * Detect communities in a set of nodes using the specified algorithm
 *
 * This is the main entry point for community detection. It provides a unified
 * interface to all available algorithms.
 *
 * @param nodes Array of community nodes with embeddings
 * @param config Algorithm configuration
 * @param algorithm Algorithm to use ('leiden' or 'connected')
 * @returns Promise resolving to community detection results
 *
 * @example
 * ```typescript
 * const nodes: CommunityNode[] = [
 *   { id: '1', type: 'knowledge', embedding: [0.1, 0.2, 0.3] },
 *   { id: '2', type: 'knowledge', embedding: [0.15, 0.25, 0.35] },
 *   { id: '3', type: 'tool', embedding: [0.8, 0.9, 0.7] },
 * ];
 *
 * // Using Leiden algorithm (default)
 * const result = await detectCommunities(nodes, {
 *   similarityThreshold: 0.75,
 *   minCommunitySize: 2,
 * });
 *
 * console.log(`Found ${result.communities.length} communities`);
 * console.log(`Modularity: ${result.modularity}`);
 *
 * // Using connected components for sparse graphs
 * const sparseResult = await detectCommunities(nodes, {
 *   similarityThreshold: 0.85,
 * }, 'connected');
 * ```
 */
export async function detectCommunities(
  nodes: CommunityNode[],
  config?: CommunityDetectionConfig,
  algorithm: CommunityDetectionAlgorithm = 'leiden'
): Promise<CommunityDetectionResult> {
  switch (algorithm) {
    case 'leiden':
      return detectCommunitiesLeiden(nodes, config);
    case 'connected':
      return detectCommunitiesConnected(nodes, config);
    default:
      throw new Error(`Unknown community detection algorithm: ${algorithm}`);
  }
}

/**
 * Helper function to choose the best algorithm based on graph properties
 *
 * This analyzes the input nodes and recommends an algorithm based on:
 * - Number of nodes
 * - Expected graph density
 * - Configuration parameters
 *
 * @param nodes Array of community nodes
 * @param config Configuration parameters
 * @returns Recommended algorithm
 *
 * @example
 * ```typescript
 * const algorithm = recommendAlgorithm(nodes, { similarityThreshold: 0.9 });
 * const result = await detectCommunities(nodes, config, algorithm);
 * ```
 */
export function recommendAlgorithm(
  nodes: CommunityNode[],
  config?: CommunityDetectionConfig
): CommunityDetectionAlgorithm {
  const threshold = config?.similarityThreshold ?? 0.75;
  const nodeCount = nodes.length;

  // For very small graphs, connected components is sufficient
  if (nodeCount < 10) {
    return 'connected';
  }

  // For high thresholds (sparse graphs), connected components works well
  if (threshold >= 0.85) {
    return 'connected';
  }

  // For larger, denser graphs, use Leiden for better quality
  return 'leiden';
}

/**
 * Batch process multiple node sets for community detection
 *
 * Useful when you need to detect communities across multiple scopes
 * or time periods separately.
 *
 * @param nodeSets Array of node arrays to process
 * @param config Common configuration for all sets
 * @param algorithm Algorithm to use
 * @returns Array of results for each node set
 *
 * @example
 * ```typescript
 * const projectNodes = [...];
 * const globalNodes = [...];
 *
 * const results = await batchDetectCommunities(
 *   [projectNodes, globalNodes],
 *   { minCommunitySize: 3 },
 *   'leiden'
 * );
 *
 * results.forEach((result, i) => {
 *   console.log(`Set ${i}: ${result.communities.length} communities`);
 * });
 * ```
 */
export async function batchDetectCommunities(
  nodeSets: CommunityNode[][],
  config?: CommunityDetectionConfig,
  algorithm: CommunityDetectionAlgorithm = 'leiden'
): Promise<CommunityDetectionResult[]> {
  return Promise.all(
    nodeSets.map(nodes => detectCommunities(nodes, config, algorithm))
  );
}

/**
 * Validate community detection configuration
 *
 * Checks that configuration parameters are valid and within acceptable ranges.
 *
 * @param config Configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateConfig(config: CommunityDetectionConfig): void {
  if (config.resolution !== undefined) {
    if (config.resolution <= 0) {
      throw new Error('Resolution must be positive');
    }
  }

  if (config.minCommunitySize !== undefined) {
    if (config.minCommunitySize < 1) {
      throw new Error('Minimum community size must be at least 1');
    }
  }

  if (config.similarityThreshold !== undefined) {
    if (config.similarityThreshold < 0 || config.similarityThreshold > 1) {
      throw new Error('Similarity threshold must be between 0 and 1');
    }
  }

  if (config.maxIterations !== undefined) {
    if (config.maxIterations < 1) {
      throw new Error('Maximum iterations must be at least 1');
    }
  }

  if (config.convergenceThreshold !== undefined) {
    if (config.convergenceThreshold <= 0) {
      throw new Error('Convergence threshold must be positive');
    }
  }
}
