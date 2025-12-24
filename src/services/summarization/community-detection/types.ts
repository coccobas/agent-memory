/**
 * Community Detection Types
 *
 * Type definitions for hierarchical summarization community detection algorithms.
 * These types support the clustering of memory entries into communities for
 * multi-level summarization.
 */

// =============================================================================
// CORE TYPES
// =============================================================================

/**
 * Node type in the community graph
 */
export type CommunityNodeType = 'tool' | 'guideline' | 'knowledge' | 'experience' | 'summary';

/**
 * A node in the community detection graph
 *
 * Represents a memory entry (tool, guideline, knowledge, etc.) that can be
 * clustered with similar nodes.
 */
export interface CommunityNode {
  /** Unique identifier for the node */
  id: string;

  /** Type of memory entry this node represents */
  type: CommunityNodeType;

  /** Embedding vector for similarity calculations (optional) */
  embedding?: number[];

  /** Additional metadata that may be useful for clustering */
  metadata?: Record<string, unknown>;
}

/**
 * A detected community of similar nodes
 *
 * Represents a cluster of related memory entries that should be
 * summarized together.
 */
export interface Community {
  /** Unique identifier for this community */
  id: string;

  /** Member nodes in this community */
  members: CommunityNode[];

  /** Centroid embedding (average of all member embeddings) */
  centroid?: number[];

  /**
   * Cohesion score indicating how similar members are
   * Range: 0-1, where 1 means all members are identical
   */
  cohesion: number;

  /** Metadata about the community */
  metadata?: {
    /** Average pairwise similarity between members */
    avgSimilarity?: number;
    /** Minimum similarity between any two members */
    minSimilarity?: number;
    /** Maximum similarity between any two members */
    maxSimilarity?: number;
    /** Dominant node types in the community */
    dominantTypes?: CommunityNodeType[];
  };
}

// =============================================================================
// ALGORITHM RESULTS
// =============================================================================

/**
 * Result of community detection algorithm
 */
export interface CommunityDetectionResult {
  /** Detected communities */
  communities: Community[];

  /**
   * Modularity score measuring quality of the partition
   * Range: -0.5 to 1, where higher is better
   * Negative values indicate worse than random partitioning
   */
  modularity: number;

  /** Processing time in milliseconds */
  processingTimeMs: number;

  /** Algorithm-specific metadata */
  metadata?: {
    /** Number of iterations performed */
    iterations?: number;
    /** Whether the algorithm converged */
    converged?: boolean;
    /** Final quality improvement delta */
    qualityDelta?: number;
  };
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Configuration for community detection algorithms
 */
export interface CommunityDetectionConfig {
  /**
   * Resolution parameter for Leiden algorithm
   * Higher values lead to more, smaller communities
   * Default: 1.0
   */
  resolution?: number;

  /**
   * Minimum number of members required to form a community
   * Default: 3
   */
  minCommunitySize?: number;

  /**
   * Similarity threshold for considering nodes as connected
   * Range: 0-1, where 1 requires identical embeddings
   * Default: 0.75
   */
  similarityThreshold?: number;

  /**
   * Maximum number of iterations for iterative algorithms
   * Default: 100
   */
  maxIterations?: number;

  /**
   * Convergence threshold for iterative algorithms
   * Algorithm stops when quality improvement is below this value
   * Default: 0.001
   */
  convergenceThreshold?: number;

  /**
   * Random seed for reproducible results
   */
  randomSeed?: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_COMMUNITY_DETECTION_CONFIG: Required<CommunityDetectionConfig> = {
  resolution: 1.0,
  minCommunitySize: 3,
  similarityThreshold: 0.75,
  maxIterations: 100,
  convergenceThreshold: 0.001,
  randomSeed: 42,
};

// =============================================================================
// GRAPH STRUCTURES
// =============================================================================

/**
 * Edge in the similarity graph
 */
export interface SimilarityEdge {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Similarity weight (0-1) */
  weight: number;
}

/**
 * Graph adjacency list representation
 *
 * Maps node ID to list of connected neighbor IDs with weights
 */
export type AdjacencyList = Map<string, Array<{ nodeId: string; weight: number }>>;

/**
 * Similarity graph built from node embeddings
 */
export interface SimilarityGraph {
  /** All nodes in the graph */
  nodes: CommunityNode[];
  /** Graph edges */
  edges: SimilarityEdge[];
  /** Adjacency list for efficient traversal */
  adjacencyList: AdjacencyList;
  /** Total edge weight in the graph */
  totalWeight: number;
}

// =============================================================================
// ALGORITHM TYPES
// =============================================================================

/**
 * Available community detection algorithms
 */
export type CommunityDetectionAlgorithm = 'leiden' | 'connected';

/**
 * Community detection function signature
 */
export type CommunityDetectionFunction = (
  nodes: CommunityNode[],
  config?: CommunityDetectionConfig
) => Promise<CommunityDetectionResult>;
