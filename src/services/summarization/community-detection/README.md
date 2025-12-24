# Community Detection for Hierarchical Summarization

This module provides community detection algorithms for clustering memory entries into communities for hierarchical summarization. Communities are groups of similar entries that can be summarized together at higher levels of abstraction.

## Overview

The community detection system analyzes embeddings of memory entries (tools, guidelines, knowledge, experiences) and groups similar items into communities using graph-based clustering algorithms.

## Available Algorithms

### Leiden Algorithm (Recommended)

The Leiden algorithm is an advanced community detection method that optimizes modularity - a measure of how well-separated communities are. It's an improvement over the popular Louvain algorithm with better guarantees on community quality.

**Best for:**
- Medium to large graphs (10+ nodes)
- Dense similarity graphs (lower thresholds ~0.75)
- When optimal community quality is important

**Features:**
- Iteratively optimizes modularity
- Provides convergence guarantees
- Adjustable resolution parameter
- Returns detailed metadata (iterations, convergence status)

### Connected Components (Fallback)

A simple, fast algorithm that finds connected components in the similarity graph using Union-Find data structure. Two nodes are connected if their similarity exceeds the threshold.

**Best for:**
- Small graphs (<10 nodes)
- Sparse graphs (high thresholds ~0.85)
- When speed is more important than optimal quality

**Features:**
- Single-pass algorithm (very fast)
- Clear separation of communities
- Lower computational overhead
- Simple to understand and debug

## Usage

### Basic Usage

```typescript
import { detectCommunities, type CommunityNode } from './community-detection';

// Create nodes with embeddings
const nodes: CommunityNode[] = [
  { id: '1', type: 'knowledge', embedding: [0.1, 0.2, 0.3] },
  { id: '2', type: 'knowledge', embedding: [0.12, 0.22, 0.32] },
  { id: '3', type: 'tool', embedding: [0.8, 0.9, 0.7] },
];

// Detect communities using Leiden (default)
const result = await detectCommunities(nodes, {
  similarityThreshold: 0.75,
  minCommunitySize: 2,
});

console.log(`Found ${result.communities.length} communities`);
console.log(`Modularity: ${result.modularity}`);

// Access communities
result.communities.forEach(community => {
  console.log(`Community ${community.id}: ${community.members.length} members`);
  console.log(`  Cohesion: ${community.cohesion}`);
  console.log(`  Types: ${community.metadata?.dominantTypes}`);
});
```

### Algorithm Selection

```typescript
import { detectCommunities, recommendAlgorithm } from './community-detection';

// Get recommended algorithm based on data
const algorithm = recommendAlgorithm(nodes, config);

// Use specific algorithm
const leidenResult = await detectCommunities(nodes, config, 'leiden');
const connectedResult = await detectCommunities(nodes, config, 'connected');
```

### Configuration

```typescript
const config = {
  // Similarity threshold for connecting nodes (0-1)
  // Higher = more similar required for same community
  similarityThreshold: 0.75,

  // Minimum members required to form a community
  minCommunitySize: 3,

  // Leiden-specific: resolution parameter
  // Higher = more, smaller communities
  resolution: 1.0,

  // Leiden-specific: maximum iterations
  maxIterations: 100,

  // Leiden-specific: convergence threshold
  convergenceThreshold: 0.001,

  // Random seed for reproducible results
  randomSeed: 42,
};
```

### Batch Processing

```typescript
import { batchDetectCommunities } from './community-detection';

const projectNodes = [...];
const globalNodes = [...];

const results = await batchDetectCommunities(
  [projectNodes, globalNodes],
  { minCommunitySize: 3 },
  'leiden'
);

results.forEach((result, i) => {
  console.log(`Set ${i}: ${result.communities.length} communities`);
});
```

## Types

### CommunityNode

```typescript
interface CommunityNode {
  id: string;
  type: 'tool' | 'guideline' | 'knowledge' | 'experience' | 'summary';
  embedding?: number[];
  metadata?: Record<string, unknown>;
}
```

### Community

```typescript
interface Community {
  id: string;
  members: CommunityNode[];
  centroid?: number[];
  cohesion: number; // 0-1, higher = more similar members
  metadata?: {
    avgSimilarity?: number;
    minSimilarity?: number;
    maxSimilarity?: number;
    dominantTypes?: CommunityNodeType[];
  };
}
```

### CommunityDetectionResult

```typescript
interface CommunityDetectionResult {
  communities: Community[];
  modularity: number; // -0.5 to 1, higher = better separation
  processingTimeMs: number;
  metadata?: {
    iterations?: number;
    converged?: boolean;
    qualityDelta?: number;
  };
}
```

## Metrics

### Modularity

Modularity measures the quality of a network partition:
- **Range:** -0.5 to 1.0
- **Interpretation:**
  - > 0.3: Good community structure
  - 0.0 to 0.3: Weak community structure
  - < 0: Worse than random partitioning

### Cohesion

Cohesion measures how similar members within a community are:
- **Range:** 0 to 1
- **Calculation:** Average pairwise cosine similarity
- **Interpretation:**
  - > 0.9: Very cohesive (highly similar)
  - 0.7 to 0.9: Moderately cohesive
  - < 0.7: Loosely cohesive

## Algorithm Details

### Leiden Algorithm

1. **Initialization:** Each node starts in its own community
2. **Local Moving:** Nodes are moved to neighboring communities to maximize modularity
3. **Refinement:** Communities are refined to ensure connectivity
4. **Iteration:** Process repeats until convergence

Time complexity: O(n × m × i) where:
- n = number of nodes
- m = number of edges
- i = number of iterations (typically low)

### Connected Components

1. **Graph Construction:** Build similarity graph with edges above threshold
2. **Union-Find:** Use disjoint set union to find connected components
3. **Component Extraction:** Extract communities from component structure

Time complexity: O(n² + e × α(n)) where:
- n = number of nodes
- e = number of edges
- α = inverse Ackermann function (effectively constant)

## Similarity Utilities

The module includes utilities for working with embeddings:

```typescript
import {
  cosineSimilarity,
  computeCentroid,
  buildSimilarityGraph,
  calculateCohesion,
} from './community-detection';

// Calculate similarity between two embeddings
const similarity = cosineSimilarity([0.1, 0.2], [0.15, 0.25]);

// Compute centroid of embeddings
const centroid = computeCentroid([
  [0.1, 0.2, 0.3],
  [0.12, 0.22, 0.32],
]);

// Build similarity graph
const graph = buildSimilarityGraph(nodes, 0.75);

// Calculate community cohesion
const cohesion = calculateCohesion(nodes);
```

## Integration with Hierarchical Summarization

Communities detected by this module can be used for hierarchical summarization:

1. **Level 0:** Individual memory entries
2. **Level 1:** Communities of similar entries
3. **Level 2:** Super-communities (communities of communities)
4. **Level N:** Top-level summaries

Each level provides progressively higher abstraction while maintaining semantic coherence.

## Performance Considerations

- **Small graphs (<10 nodes):** Use connected components
- **Medium graphs (10-100 nodes):** Use Leiden with default settings
- **Large graphs (100+ nodes):** Consider increasing `similarityThreshold` or using sampling
- **Very large graphs (1000+ nodes):** Pre-filter nodes or use hierarchical approach

## Validation

Always validate configuration before use:

```typescript
import { validateConfig } from './community-detection';

try {
  validateConfig(config);
  // Proceed with detection
} catch (error) {
  console.error('Invalid configuration:', error);
}
```

## References

1. Traag, V.A., Waltman, L. & van Eck, N.J. "From Louvain to Leiden: guaranteeing well-connected communities." *Sci Rep* 9, 5233 (2019).
2. Blondel, V.D., Guillaume, J.L., Lambiotte, R. & Lefebvre, E. "Fast unfolding of communities in large networks." *J. Stat. Mech.* 2008, P10008 (2008).
3. Newman, M.E.J. & Girvan, M. "Finding and evaluating community structure in networks." *Phys. Rev. E* 69, 026113 (2004).
