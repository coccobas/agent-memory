/**
 * Similarity Utilities for Community Detection
 *
 * Provides functions for calculating similarity between nodes,
 * building similarity graphs, and computing centroids.
 *
 * NOTE: Non-null assertions are used for array/embedding access after validation
 * in mathematical algorithms.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import type { CommunityNode, SimilarityGraph, SimilarityEdge, AdjacencyList } from './types.js';
import { createValidationError } from '../../../core/errors.js';
import { createComponentLogger } from '../../../utils/logger.js';

const logger = createComponentLogger('similarity');

// =============================================================================
// COSINE SIMILARITY
// =============================================================================

/**
 * Calculate cosine similarity between two embedding vectors
 *
 * Cosine similarity measures the cosine of the angle between two vectors,
 * resulting in a value between -1 (opposite) and 1 (identical).
 * For normalized embeddings, this is equivalent to dot product.
 *
 * @param a First embedding vector
 * @param b Second embedding vector
 * @returns Similarity score between -1 and 1 (typically 0-1 for embeddings)
 * @throws Error if vectors have different dimensions
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw createValidationError('vectors', `dimension mismatch: ${a.length} vs ${b.length}`);
  }

  if (a.length === 0) {
    return 0.0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const valA = a[i]!;
    const valB = b[i]!;

    // Bug #238 fix: Check for NaN/Infinity in vector components
    // NaN propagates silently through calculations causing wrong results
    if (!Number.isFinite(valA) || !Number.isFinite(valB)) {
      return 0.0; // Return 0 similarity for invalid vectors
    }

    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);

  if (magnitude === 0) {
    return 0.0;
  }

  // Bug #238 fix: Final guard against NaN/Infinity in result
  const result = dotProduct / magnitude;
  return Number.isFinite(result) ? result : 0.0;
}

/**
 * Calculate pairwise similarities between a node and multiple other nodes
 *
 * @param node Source node
 * @param otherNodes Target nodes to compare against
 * @returns Array of similarities in the same order as otherNodes
 */
export function pairwiseSimilarities(node: CommunityNode, otherNodes: CommunityNode[]): number[] {
  if (!node.embedding) {
    return otherNodes.map(() => 0);
  }

  return otherNodes.map((other) => {
    if (!other.embedding) {
      return 0;
    }
    return cosineSimilarity(node.embedding!, other.embedding);
  });
}

// =============================================================================
// CENTROID CALCULATION
// =============================================================================

/**
 * Compute the centroid (average) of multiple embeddings
 *
 * The centroid is calculated by averaging each dimension across all embeddings.
 * This produces a representative embedding for a group of nodes.
 *
 * @param embeddings Array of embedding vectors
 * @returns Centroid embedding, or undefined if no valid embeddings
 */
export function computeCentroid(embeddings: number[][]): number[] | undefined {
  if (embeddings.length === 0) {
    return undefined;
  }

  // Filter out empty embeddings
  const validEmbeddings = embeddings.filter((e) => e.length > 0);
  if (validEmbeddings.length === 0) {
    return undefined;
  }

  const dimension = validEmbeddings[0]!.length;

  // Verify all embeddings have the same dimension
  for (const embedding of validEmbeddings) {
    if (embedding.length !== dimension) {
      throw createValidationError(
        'embeddings',
        `dimension mismatch: expected ${dimension}, got ${embedding.length}`
      );
    }
  }

  // Calculate average for each dimension
  const centroid = new Array<number>(dimension).fill(0);

  for (const embedding of validEmbeddings) {
    for (let i = 0; i < dimension; i++) {
      centroid[i]! += embedding[i]!;
    }
  }

  const count = validEmbeddings.length;
  for (let i = 0; i < dimension; i++) {
    centroid[i]! /= count;
  }

  return centroid;
}

/**
 * Compute centroid from an array of nodes
 *
 * Convenience function that extracts embeddings from nodes.
 *
 * @param nodes Array of community nodes
 * @returns Centroid embedding, or undefined if no nodes have embeddings
 */
export function computeNodeCentroid(nodes: CommunityNode[]): number[] | undefined {
  const embeddings = nodes.map((n) => n.embedding).filter((e): e is number[] => e !== undefined);

  return computeCentroid(embeddings);
}

// =============================================================================
// SIMILARITY GRAPH CONSTRUCTION
// =============================================================================

/**
 * Build a similarity graph from nodes using cosine similarity
 *
 * Creates a graph where nodes are connected if their similarity exceeds
 * the threshold. Only nodes with embeddings are included.
 *
 * Bug #202 NOTE: This is O(n²) in the number of nodes due to pairwise
 * similarity computation. For large graphs (1000+ nodes), this can be slow.
 * Future optimization could use approximate nearest neighbor (ANN) algorithms
 * like LSH (Locality-Sensitive Hashing) or HNSW (Hierarchical Navigable Small Worlds).
 *
 * @param nodes Array of community nodes
 * @param threshold Minimum similarity to create an edge (0-1)
 * @returns Similarity graph with nodes, edges, and adjacency list
 */
export function buildSimilarityGraph(nodes: CommunityNode[], threshold: number): SimilarityGraph {
  // Filter nodes that have embeddings
  const nodesWithEmbeddings = nodes.filter((n) => n.embedding !== undefined);

  const edges: SimilarityEdge[] = [];
  const adjacencyList: AdjacencyList = new Map();
  let totalWeight = 0;

  // Bug #202: Warn about O(n²) complexity for large graphs
  const pairCount = (nodesWithEmbeddings.length * (nodesWithEmbeddings.length - 1)) / 2;
  if (pairCount > 100000) {
    logger.warn(
      {
        nodeCount: nodesWithEmbeddings.length,
        pairCount,
        estimatedOps: pairCount,
      },
      'Bug #202: Large similarity graph - O(n²) computation may be slow. Consider using smaller batches or higher similarity threshold.'
    );
  }

  // Initialize adjacency list
  for (const node of nodesWithEmbeddings) {
    adjacencyList.set(node.id, []);
  }

  // Calculate pairwise similarities and create edges
  for (let i = 0; i < nodesWithEmbeddings.length; i++) {
    const nodeA = nodesWithEmbeddings[i]!;

    for (let j = i + 1; j < nodesWithEmbeddings.length; j++) {
      const nodeB = nodesWithEmbeddings[j]!;

      const similarity = cosineSimilarity(nodeA.embedding!, nodeB.embedding!);

      // Only create edge if similarity exceeds threshold
      if (similarity >= threshold) {
        edges.push({
          from: nodeA.id,
          to: nodeB.id,
          weight: similarity,
        });

        // Add to adjacency list (undirected graph)
        adjacencyList.get(nodeA.id)!.push({
          nodeId: nodeB.id,
          weight: similarity,
        });
        adjacencyList.get(nodeB.id)!.push({
          nodeId: nodeA.id,
          weight: similarity,
        });

        totalWeight += similarity * 2; // Count both directions
      }
    }
  }

  return {
    nodes: nodesWithEmbeddings,
    edges,
    adjacencyList,
    totalWeight,
  };
}

// =============================================================================
// COHESION METRICS
// =============================================================================

/**
 * Calculate cohesion score for a set of nodes
 *
 * Cohesion is measured as the average pairwise similarity between all
 * members of the community. Higher cohesion indicates more similar members.
 *
 * @param nodes Array of community nodes
 * @returns Cohesion score between 0 and 1, or 1.0 for single-node communities
 */
export function calculateCohesion(nodes: CommunityNode[]): number {
  if (nodes.length <= 1) {
    return 1.0; // Single node or empty community is perfectly cohesive
  }

  const nodesWithEmbeddings = nodes.filter((n) => n.embedding !== undefined);

  if (nodesWithEmbeddings.length <= 1) {
    return 1.0; // Can't measure cohesion without embeddings
  }

  let totalSimilarity = 0;
  let pairCount = 0;

  // Calculate average pairwise similarity
  for (let i = 0; i < nodesWithEmbeddings.length; i++) {
    const nodeA = nodesWithEmbeddings[i]!;

    for (let j = i + 1; j < nodesWithEmbeddings.length; j++) {
      const nodeB = nodesWithEmbeddings[j]!;

      const similarity = cosineSimilarity(nodeA.embedding!, nodeB.embedding!);

      totalSimilarity += similarity;
      pairCount++;
    }
  }

  if (pairCount === 0) {
    return 1.0;
  }

  return totalSimilarity / pairCount;
}

/**
 * Calculate detailed cohesion metrics for a community
 *
 * @param nodes Array of community nodes
 * @returns Object with average, min, and max pairwise similarities
 */
export function calculateDetailedCohesion(nodes: CommunityNode[]): {
  avgSimilarity: number;
  minSimilarity: number;
  maxSimilarity: number;
} {
  if (nodes.length <= 1) {
    return {
      avgSimilarity: 1.0,
      minSimilarity: 1.0,
      maxSimilarity: 1.0,
    };
  }

  const nodesWithEmbeddings = nodes.filter((n) => n.embedding !== undefined);

  if (nodesWithEmbeddings.length <= 1) {
    return {
      avgSimilarity: 1.0,
      minSimilarity: 1.0,
      maxSimilarity: 1.0,
    };
  }

  let totalSimilarity = 0;
  let minSimilarity = 1.0;
  let maxSimilarity = 0.0;
  let pairCount = 0;

  for (let i = 0; i < nodesWithEmbeddings.length; i++) {
    const nodeA = nodesWithEmbeddings[i]!;

    for (let j = i + 1; j < nodesWithEmbeddings.length; j++) {
      const nodeB = nodesWithEmbeddings[j]!;

      const similarity = cosineSimilarity(nodeA.embedding!, nodeB.embedding!);

      totalSimilarity += similarity;
      minSimilarity = Math.min(minSimilarity, similarity);
      maxSimilarity = Math.max(maxSimilarity, similarity);
      pairCount++;
    }
  }

  return {
    avgSimilarity: pairCount > 0 ? totalSimilarity / pairCount : 1.0,
    minSimilarity,
    maxSimilarity,
  };
}
