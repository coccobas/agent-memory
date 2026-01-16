/**
 * Graph Traversal Depth Tests (P1)
 *
 * Tests edge cases in graph traversal:
 * - Off-by-one errors in depth limiting
 * - Cycle detection
 * - Self-referential nodes
 * - Very deep graphs
 * - Wide graphs (high branching factor)
 */

import { describe, it, expect, vi } from 'vitest';

describe('Graph Traversal Depth - Edge Cases', () => {
  describe('Depth Limiting', () => {
    it('should traverse exactly to specified depth', () => {
      const graph = createChainGraph(10);
      const result = traverseGraph(graph, 'node-0', { maxDepth: 3 });

      // Should include nodes at depth 0, 1, 2, 3 (4 nodes total)
      expect(result.visited.length).toBe(4);
      expect(result.visited).toContain('node-0');
      expect(result.visited).toContain('node-1');
      expect(result.visited).toContain('node-2');
      expect(result.visited).toContain('node-3');
      expect(result.visited).not.toContain('node-4');
    });

    it('should handle depth=0 (only start node)', () => {
      const graph = createChainGraph(5);
      const result = traverseGraph(graph, 'node-0', { maxDepth: 0 });

      expect(result.visited.length).toBe(1);
      expect(result.visited).toContain('node-0');
    });

    it('should handle depth=1', () => {
      const graph = createChainGraph(5);
      const result = traverseGraph(graph, 'node-0', { maxDepth: 1 });

      expect(result.visited.length).toBe(2);
      expect(result.visited).toContain('node-0');
      expect(result.visited).toContain('node-1');
    });

    it('should handle negative depth', () => {
      const graph = createChainGraph(5);
      const result = traverseGraph(graph, 'node-0', { maxDepth: -1 });

      // Should either treat as 0 or error
      expect(result.visited.length).toBeLessThanOrEqual(1);
    });

    it('should handle depth greater than graph size', () => {
      const graph = createChainGraph(3);
      const result = traverseGraph(graph, 'node-0', { maxDepth: 100 });

      // Should visit all 3 nodes
      expect(result.visited.length).toBe(3);
    });

    it('should handle very large depth', () => {
      const graph = createChainGraph(5);
      const result = traverseGraph(graph, 'node-0', { maxDepth: Number.MAX_SAFE_INTEGER });

      expect(result.visited.length).toBe(5);
    });
  });

  describe('Cycle Detection', () => {
    it('should detect simple cycle (A -> B -> A)', () => {
      const graph = createCyclicGraph(
        ['A', 'B'],
        [
          ['A', 'B'],
          ['B', 'A'],
        ]
      );

      const result = traverseGraph(graph, 'A', { maxDepth: 10 });

      // Should not infinite loop
      expect(result.visited.length).toBe(2);
      expect(result.hasCycle).toBe(true);
    });

    it('should detect longer cycle (A -> B -> C -> A)', () => {
      const graph = createCyclicGraph(
        ['A', 'B', 'C'],
        [
          ['A', 'B'],
          ['B', 'C'],
          ['C', 'A'],
        ]
      );

      const result = traverseGraph(graph, 'A', { maxDepth: 20 });

      expect(result.visited.length).toBe(3);
      expect(result.hasCycle).toBe(true);
    });

    it('should detect self-loop (A -> A)', () => {
      const graph = createCyclicGraph(['A'], [['A', 'A']]);

      const result = traverseGraph(graph, 'A', { maxDepth: 10 });

      expect(result.visited.length).toBe(1);
      expect(result.hasCycle).toBe(true);
    });

    it('should handle graph with multiple cycles', () => {
      const graph = createCyclicGraph(
        ['A', 'B', 'C', 'D'],
        [
          ['A', 'B'],
          ['B', 'A'],
          ['C', 'D'],
          ['D', 'C'],
          ['A', 'C'],
        ]
      );

      const result = traverseGraph(graph, 'A', { maxDepth: 20 });

      expect(result.visited.length).toBe(4);
      expect(result.hasCycle).toBe(true);
    });

    it('should handle DAG (no cycles)', () => {
      const graph = createCyclicGraph(
        ['A', 'B', 'C'],
        [
          ['A', 'B'],
          ['A', 'C'],
          ['B', 'C'],
        ]
      );

      const result = traverseGraph(graph, 'A', { maxDepth: 10 });

      expect(result.visited.length).toBe(3);
      expect(result.hasCycle).toBe(false);
    });
  });

  describe('Wide Graphs (High Branching Factor)', () => {
    it('should handle high branching factor', () => {
      const graph = createStarGraph('center', 100);
      const result = traverseGraph(graph, 'center', { maxDepth: 1 });

      expect(result.visited.length).toBe(101); // center + 100 children
    });

    it('should handle maxResults limit', () => {
      const graph = createStarGraph('center', 1000);
      const result = traverseGraph(graph, 'center', { maxDepth: 1, maxResults: 50 });

      expect(result.visited.length).toBeLessThanOrEqual(50);
    });

    it('should handle tree with exponential growth', () => {
      // Binary tree: 1 + 2 + 4 + 8 = 15 nodes at depth 3
      const graph = createBinaryTree(4);
      const result = traverseGraph(graph, 'node-0', { maxDepth: 3, maxResults: 1000 });

      expect(result.visited.length).toBeLessThanOrEqual(15);
    });
  });

  describe('Isolated Nodes', () => {
    it('should handle isolated start node', () => {
      const graph: Graph = {
        nodes: ['A', 'B', 'C'],
        edges: [], // No edges
      };

      const result = traverseGraph(graph, 'A', { maxDepth: 10 });

      expect(result.visited.length).toBe(1);
      expect(result.visited).toContain('A');
    });

    it('should handle non-existent start node', () => {
      const graph = createChainGraph(3);
      const result = traverseGraph(graph, 'non-existent', { maxDepth: 10 });

      expect(result.visited.length).toBe(0);
      expect(result.error).toBeDefined();
    });

    it('should handle disconnected components', () => {
      const graph: Graph = {
        nodes: ['A', 'B', 'C', 'D'],
        edges: [
          ['A', 'B'],
          ['C', 'D'],
        ],
      };

      // Starting from A should only reach B
      const result = traverseGraph(graph, 'A', { maxDepth: 10 });

      expect(result.visited).toContain('A');
      expect(result.visited).toContain('B');
      expect(result.visited).not.toContain('C');
      expect(result.visited).not.toContain('D');
    });
  });

  describe('Bidirectional Traversal', () => {
    it('should traverse forward only', () => {
      const graph = createChainGraph(5);
      const result = traverseGraph(graph, 'node-2', {
        maxDepth: 10,
        direction: 'forward',
      });

      expect(result.visited).toContain('node-2');
      expect(result.visited).toContain('node-3');
      expect(result.visited).toContain('node-4');
      expect(result.visited).not.toContain('node-0');
      expect(result.visited).not.toContain('node-1');
    });

    it('should traverse backward only', () => {
      const graph = createChainGraph(5);
      const result = traverseGraph(graph, 'node-2', {
        maxDepth: 10,
        direction: 'backward',
      });

      expect(result.visited).toContain('node-2');
      expect(result.visited).toContain('node-1');
      expect(result.visited).toContain('node-0');
      expect(result.visited).not.toContain('node-3');
      expect(result.visited).not.toContain('node-4');
    });

    it('should traverse both directions', () => {
      const graph = createChainGraph(5);
      const result = traverseGraph(graph, 'node-2', {
        maxDepth: 10,
        direction: 'both',
      });

      expect(result.visited.length).toBe(5);
    });
  });

  describe('Edge Weight Handling', () => {
    it('should consider edge weights in traversal order', () => {
      const graph = createWeightedGraph();
      const result = traverseGraph(graph, 'A', { maxDepth: 1, useWeights: true });

      // Higher weight edges should be traversed first
      expect(result.visited.indexOf('B')).toBeLessThan(result.visited.indexOf('C'));
    });

    it('should handle zero weight edges', () => {
      const graph: Graph = {
        nodes: ['A', 'B'],
        edges: [['A', 'B', 0]],
      };

      const result = traverseGraph(graph, 'A', { maxDepth: 1, useWeights: true });

      // Should still traverse even with 0 weight
      expect(result.visited).toContain('B');
    });

    it('should handle negative weight edges', () => {
      const graph: Graph = {
        nodes: ['A', 'B'],
        edges: [['A', 'B', -1]],
      };

      const result = traverseGraph(graph, 'A', { maxDepth: 1, useWeights: true });

      // Should handle gracefully
      expect(result.visited).toContain('A');
    });
  });

  describe('Memory and Performance', () => {
    it('should handle 10,000 node chain without stack overflow', () => {
      const graph = createChainGraph(10000);
      const result = traverseGraph(graph, 'node-0', { maxDepth: 100 });

      // Should complete without error and respect depth limit
      expect(result.visited.length).toBeLessThanOrEqual(101);
      expect(result.error).toBeUndefined();
    });

    it('should handle 1,000 node star without memory issues', () => {
      const graph = createStarGraph('center', 1000);
      const result = traverseGraph(graph, 'center', { maxDepth: 1 });

      expect(result.visited.length).toBe(1001);
    });
  });

  describe('Relation Type Filtering', () => {
    it('should filter by relation type', () => {
      const graph = createTypedGraph();
      const result = traverseGraph(graph, 'A', {
        maxDepth: 10,
        relationTypes: ['depends_on'],
      });

      // Should only follow depends_on edges
      expect(result.visited).toContain('A');
      expect(result.visited).toContain('B'); // A depends_on B
      expect(result.visited).not.toContain('C'); // A related_to C
    });

    it('should handle multiple relation types', () => {
      const graph = createTypedGraph();
      const result = traverseGraph(graph, 'A', {
        maxDepth: 10,
        relationTypes: ['depends_on', 'related_to'],
      });

      expect(result.visited).toContain('A');
      expect(result.visited).toContain('B');
      expect(result.visited).toContain('C');
    });

    it('should handle empty relation types (all)', () => {
      const graph = createTypedGraph();
      const result = traverseGraph(graph, 'A', {
        maxDepth: 10,
        relationTypes: [],
      });

      // Empty array should mean "all types"
      expect(result.visited.length).toBeGreaterThan(1);
    });
  });
});

// =============================================================================
// Test Data Structures and Helper Functions
// =============================================================================

interface Graph {
  nodes: string[];
  edges: Array<[string, string, number?]>;
  edgeTypes?: Map<string, string>;
}

interface TraversalOptions {
  maxDepth: number;
  maxResults?: number;
  direction?: 'forward' | 'backward' | 'both';
  useWeights?: boolean;
  relationTypes?: string[];
}

interface TraversalResult {
  visited: string[];
  hasCycle: boolean;
  error?: string;
}

function createChainGraph(length: number): Graph {
  const nodes: string[] = [];
  const edges: Array<[string, string]> = [];

  for (let i = 0; i < length; i++) {
    nodes.push(`node-${i}`);
    if (i > 0) {
      edges.push([`node-${i - 1}`, `node-${i}`]);
    }
  }

  return { nodes, edges };
}

function createCyclicGraph(nodes: string[], edges: Array<[string, string]>): Graph {
  return { nodes, edges };
}

function createStarGraph(center: string, numChildren: number): Graph {
  const nodes = [center];
  const edges: Array<[string, string]> = [];

  for (let i = 0; i < numChildren; i++) {
    const child = `child-${i}`;
    nodes.push(child);
    edges.push([center, child]);
  }

  return { nodes, edges };
}

function createBinaryTree(depth: number): Graph {
  const nodes: string[] = [];
  const edges: Array<[string, string]> = [];

  let nodeId = 0;
  const queue = [{ id: nodeId, currentDepth: 0 }];
  nodes.push(`node-${nodeId}`);

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.currentDepth < depth - 1) {
      // Add left child
      nodeId++;
      nodes.push(`node-${nodeId}`);
      edges.push([`node-${current.id}`, `node-${nodeId}`]);
      queue.push({ id: nodeId, currentDepth: current.currentDepth + 1 });

      // Add right child
      nodeId++;
      nodes.push(`node-${nodeId}`);
      edges.push([`node-${current.id}`, `node-${nodeId}`]);
      queue.push({ id: nodeId, currentDepth: current.currentDepth + 1 });
    }
  }

  return { nodes, edges };
}

function createWeightedGraph(): Graph {
  return {
    nodes: ['A', 'B', 'C'],
    edges: [
      ['A', 'B', 10],
      ['A', 'C', 5],
    ],
  };
}

function createTypedGraph(): Graph {
  const graph: Graph = {
    nodes: ['A', 'B', 'C', 'D'],
    edges: [
      ['A', 'B'],
      ['A', 'C'],
      ['B', 'D'],
    ],
    edgeTypes: new Map([
      ['A-B', 'depends_on'],
      ['A-C', 'related_to'],
      ['B-D', 'depends_on'],
    ]),
  };
  return graph;
}

function traverseGraph(
  graph: Graph,
  startNode: string,
  options: TraversalOptions
): TraversalResult {
  if (!graph.nodes.includes(startNode)) {
    return { visited: [], hasCycle: false, error: 'Start node not found' };
  }

  const { maxDepth, maxResults = Infinity, direction = 'forward', relationTypes } = options;

  // Handle negative depth
  if (maxDepth < 0) {
    return { visited: [], hasCycle: false };
  }

  const visited = new Set<string>();
  let hasCycle = false;

  // Build adjacency list
  const forward = new Map<string, Array<{ node: string; weight: number }>>();
  const backward = new Map<string, Array<{ node: string; weight: number }>>();

  for (const node of graph.nodes) {
    forward.set(node, []);
    backward.set(node, []);
  }

  for (const edge of graph.edges) {
    const [from, to, weight = 1] = edge;

    // Check relation type filter
    if (relationTypes && relationTypes.length > 0 && graph.edgeTypes) {
      const edgeType = graph.edgeTypes.get(`${from}-${to}`);
      if (edgeType && !relationTypes.includes(edgeType)) {
        continue;
      }
    }

    forward.get(from)?.push({ node: to, weight });
    backward.get(to)?.push({ node: from, weight });
  }

  // Sort by weight if needed
  if (options.useWeights) {
    for (const neighbors of forward.values()) {
      neighbors.sort((a, b) => b.weight - a.weight);
    }
    for (const neighbors of backward.values()) {
      neighbors.sort((a, b) => b.weight - a.weight);
    }
  }

  // Use DFS for cycle detection (back-edge detection)
  const recStack = new Set<string>(); // Nodes in current recursion stack

  function detectCycle(node: string): boolean {
    if (recStack.has(node)) return true; // Back edge found
    if (visited.has(node)) return false; // Already processed, no cycle through this path

    visited.add(node);
    recStack.add(node);

    const neighbors = forward.get(node) || [];
    for (const { node: neighbor } of neighbors) {
      if (detectCycle(neighbor)) return true;
    }

    recStack.delete(node);
    return false;
  }

  // Check for cycles starting from each unvisited node reachable from start
  // First do a cycle check from start
  const cycleVisited = new Set<string>();
  const cycleRecStack = new Set<string>();

  function checkCycleFrom(node: string): boolean {
    if (cycleRecStack.has(node)) return true;
    if (cycleVisited.has(node)) return false;

    cycleVisited.add(node);
    cycleRecStack.add(node);

    const neighbors = forward.get(node) || [];
    for (const { node: neighbor } of neighbors) {
      if (checkCycleFrom(neighbor)) return true;
    }

    cycleRecStack.delete(node);
    return false;
  }

  hasCycle = checkCycleFrom(startNode);

  // Now do BFS for actual traversal with depth limit
  visited.clear();
  const queue: Array<{ node: string; depth: number }> = [{ node: startNode, depth: 0 }];
  visited.add(startNode);

  while (queue.length > 0 && visited.size < maxResults) {
    const { node, depth } = queue.shift()!;

    if (depth >= maxDepth) continue;

    const neighbors: Array<{ node: string; weight: number }> = [];

    if (direction === 'forward' || direction === 'both') {
      neighbors.push(...(forward.get(node) || []));
    }
    if (direction === 'backward' || direction === 'both') {
      neighbors.push(...(backward.get(node) || []));
    }

    for (const { node: neighbor } of neighbors) {
      if (visited.has(neighbor)) {
        continue;
      }

      visited.add(neighbor);
      queue.push({ node: neighbor, depth: depth + 1 });

      if (visited.size >= maxResults) break;
    }
  }

  return {
    visited: Array.from(visited),
    hasCycle,
  };
}
