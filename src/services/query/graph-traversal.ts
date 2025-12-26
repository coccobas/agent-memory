/**
 * Graph Traversal for Relations
 *
 * Provides multi-hop relation traversal using recursive CTE
 * with BFS fallback for cycle detection.
 */

import { and, eq } from 'drizzle-orm';
import { getPreparedStatement, type DbClient } from '../../db/connection.js';
import { entryRelations, type RelationType } from '../../db/schema.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('graph-traversal');

// =============================================================================
// PRE-DEFINED CTE QUERIES (for prepared statement caching)
// =============================================================================

// Forward-only traversal without relation type filter
const CTE_FORWARD_NO_FILTER = `
  WITH RECURSIVE reachable(node_type, node_id, depth) AS (
    SELECT ?, ?, 0
    UNION
    SELECT r.target_type, r.target_id, g.depth + 1
    FROM entry_relations r
    JOIN reachable g ON r.source_type = g.node_type AND r.source_id = g.node_id
    WHERE g.depth < ?
  )
  SELECT DISTINCT node_type, node_id
  FROM reachable
  WHERE (node_type != ? OR node_id != ?)
    AND node_type IN ('tool', 'guideline', 'knowledge', 'experience')
  LIMIT ?
`;

// Forward-only traversal with relation type filter
const CTE_FORWARD_WITH_FILTER = `
  WITH RECURSIVE reachable(node_type, node_id, depth) AS (
    SELECT ?, ?, 0
    UNION
    SELECT r.target_type, r.target_id, g.depth + 1
    FROM entry_relations r
    JOIN reachable g ON r.source_type = g.node_type AND r.source_id = g.node_id
    WHERE g.depth < ? AND r.relation_type = ?
  )
  SELECT DISTINCT node_type, node_id
  FROM reachable
  WHERE (node_type != ? OR node_id != ?)
    AND node_type IN ('tool', 'guideline', 'knowledge', 'experience')
  LIMIT ?
`;

// Backward-only traversal without relation type filter
const CTE_BACKWARD_NO_FILTER = `
  WITH RECURSIVE reachable(node_type, node_id, depth) AS (
    SELECT ?, ?, 0
    UNION
    SELECT r.source_type, r.source_id, g.depth + 1
    FROM entry_relations r
    JOIN reachable g ON r.target_type = g.node_type AND r.target_id = g.node_id
    WHERE g.depth < ?
  )
  SELECT DISTINCT node_type, node_id
  FROM reachable
  WHERE (node_type != ? OR node_id != ?)
    AND node_type IN ('tool', 'guideline', 'knowledge', 'experience')
  LIMIT ?
`;

// Backward-only traversal with relation type filter
const CTE_BACKWARD_WITH_FILTER = `
  WITH RECURSIVE reachable(node_type, node_id, depth) AS (
    SELECT ?, ?, 0
    UNION
    SELECT r.source_type, r.source_id, g.depth + 1
    FROM entry_relations r
    JOIN reachable g ON r.target_type = g.node_type AND r.target_id = g.node_id
    WHERE g.depth < ? AND r.relation_type = ?
  )
  SELECT DISTINCT node_type, node_id
  FROM reachable
  WHERE (node_type != ? OR node_id != ?)
    AND node_type IN ('tool', 'guideline', 'knowledge', 'experience')
  LIMIT ?
`;

// Bidirectional traversal without relation type filter
const CTE_BOTH_NO_FILTER = `
  WITH RECURSIVE reachable(node_type, node_id, depth) AS (
    SELECT ?, ?, 0
    UNION
    SELECT r.target_type, r.target_id, g.depth + 1
    FROM entry_relations r
    JOIN reachable g ON r.source_type = g.node_type AND r.source_id = g.node_id
    WHERE g.depth < ?
    UNION
    SELECT r.source_type, r.source_id, g.depth + 1
    FROM entry_relations r
    JOIN reachable g ON r.target_type = g.node_type AND r.target_id = g.node_id
    WHERE g.depth < ?
  )
  SELECT DISTINCT node_type, node_id
  FROM reachable
  WHERE (node_type != ? OR node_id != ?)
    AND node_type IN ('tool', 'guideline', 'knowledge', 'experience')
  LIMIT ?
`;

// Bidirectional traversal with relation type filter
const CTE_BOTH_WITH_FILTER = `
  WITH RECURSIVE reachable(node_type, node_id, depth) AS (
    SELECT ?, ?, 0
    UNION
    SELECT r.target_type, r.target_id, g.depth + 1
    FROM entry_relations r
    JOIN reachable g ON r.source_type = g.node_type AND r.source_id = g.node_id
    WHERE g.depth < ? AND r.relation_type = ?
    UNION
    SELECT r.source_type, r.source_id, g.depth + 1
    FROM entry_relations r
    JOIN reachable g ON r.target_type = g.node_type AND r.target_id = g.node_id
    WHERE g.depth < ? AND r.relation_type = ?
  )
  SELECT DISTINCT node_type, node_id
  FROM reachable
  WHERE (node_type != ? OR node_id != ?)
    AND node_type IN ('tool', 'guideline', 'knowledge', 'experience')
  LIMIT ?
`;

/**
 * Select the appropriate pre-defined CTE query based on direction and filter
 */
function selectCTEQuery(
  direction: TraversalDirection,
  hasFilter: boolean
): string | null {
  if (direction === 'forward') {
    return hasFilter ? CTE_FORWARD_WITH_FILTER : CTE_FORWARD_NO_FILTER;
  } else if (direction === 'backward') {
    return hasFilter ? CTE_BACKWARD_WITH_FILTER : CTE_BACKWARD_NO_FILTER;
  } else if (direction === 'both') {
    return hasFilter ? CTE_BOTH_WITH_FILTER : CTE_BOTH_NO_FILTER;
  }
  return null;
}

// =============================================================================
// TYPES
// =============================================================================

export type QueryEntryType = 'tool' | 'guideline' | 'knowledge' | 'experience';
type GraphNodeType = 'tool' | 'guideline' | 'knowledge' | 'project' | 'experience';
type TraversalDirection = 'forward' | 'backward' | 'both';

interface GraphNode {
  type: GraphNodeType;
  id: string;
}

interface AdjacentNode extends GraphNode {
  relationType: string;
}

// =============================================================================
// CTE-BASED TRAVERSAL
// =============================================================================

/**
 * Traverse relations using SQLite recursive CTE for single-query performance
 * This is significantly faster than BFS with multiple queries for multi-hop traversals
 *
 * @param startType - Type of the starting node
 * @param startId - ID of the starting node
 * @param options - Traversal options
 * @returns Entry IDs grouped by type (excluding the start node)
 */
export function traverseRelationGraphCTE(
  startType: GraphNodeType,
  startId: string,
  options: {
    depth?: number;
    direction?: TraversalDirection;
    relationType?: RelationType;
    maxResults?: number;
  } = {}
): Record<QueryEntryType, Set<string>> | null {
  const maxDepth = Math.min(Math.max(options.depth ?? 1, 1), 5);
  const direction = options.direction ?? 'both';
  const maxResults = options.maxResults ?? 100;
  const relationType = options.relationType;
  const hasFilter = !!relationType;

  try {
    // OPTIMIZATION: Use pre-defined query to enable prepared statement caching
    const cteQuery = selectCTEQuery(direction, hasFilter);
    if (!cteQuery) {
      return null; // Invalid direction
    }

    // Build parameters array based on query variant
    const params: (string | number)[] = [startType, startId];

    if (direction === 'forward') {
      params.push(maxDepth);
      if (hasFilter) params.push(relationType!);
    } else if (direction === 'backward') {
      params.push(maxDepth);
      if (hasFilter) params.push(relationType!);
    } else if (direction === 'both') {
      // Both directions need maxDepth twice (once for forward, once for backward)
      params.push(maxDepth);
      if (hasFilter) params.push(relationType!);
      params.push(maxDepth);
      if (hasFilter) params.push(relationType!);
    }

    // Add WHERE clause parameters
    params.push(startType, startId, maxResults);

    // Execute the CTE query with cached prepared statement
    const stmt = getPreparedStatement(cteQuery);
    const rows = stmt.all(...params) as Array<{ node_type: string; node_id: string }>;

    // Group results by type
    const result: Record<QueryEntryType, Set<string>> = {
      tool: new Set<string>(),
      guideline: new Set<string>(),
      knowledge: new Set<string>(),
      experience: new Set<string>(),
    };

    for (const row of rows) {
      const nodeType = row.node_type as QueryEntryType;
      if (nodeType === 'tool' || nodeType === 'guideline' || nodeType === 'knowledge' || nodeType === 'experience') {
        result[nodeType].add(row.node_id);
      }
    }

    return result;
  } catch (error) {
    // CTE failed, return null to fall back to BFS
    logger.debug({ error }, 'Recursive CTE traversal failed, falling back to BFS');
    return null;
  }
}

// =============================================================================
// BFS FALLBACK
// =============================================================================

/**
 * Get adjacent nodes from a given node using indexed queries
 * Uses idx_relations_source and idx_relations_target for efficiency
 * Fallback for when CTE is not available
 */
function getAdjacentNodes(
  node: GraphNode,
  direction: TraversalDirection,
  relationType: RelationType | undefined,
  db: DbClient
): AdjacentNode[] {
  const adjacent: AdjacentNode[] = [];

  // Forward: node is source, find targets
  if (direction === 'forward' || direction === 'both') {
    const conditions = [
      eq(entryRelations.sourceType, node.type),
      eq(entryRelations.sourceId, node.id),
    ];
    if (relationType) {
      conditions.push(eq(entryRelations.relationType, relationType));
    }

    const forwardRows = db
      .select({
        targetType: entryRelations.targetType,
        targetId: entryRelations.targetId,
        relationType: entryRelations.relationType,
      })
      .from(entryRelations)
      .where(and(...conditions))
      .all();

    for (const row of forwardRows) {
      adjacent.push({
        type: row.targetType as GraphNodeType,
        id: row.targetId,
        relationType: row.relationType,
      });
    }
  }

  // Backward: node is target, find sources
  if (direction === 'backward' || direction === 'both') {
    const conditions = [
      eq(entryRelations.targetType, node.type),
      eq(entryRelations.targetId, node.id),
    ];
    if (relationType) {
      conditions.push(eq(entryRelations.relationType, relationType));
    }

    const backwardRows = db
      .select({
        sourceType: entryRelations.sourceType,
        sourceId: entryRelations.sourceId,
        relationType: entryRelations.relationType,
      })
      .from(entryRelations)
      .where(and(...conditions))
      .all();

    for (const row of backwardRows) {
      adjacent.push({
        type: row.sourceType as GraphNodeType,
        id: row.sourceId,
        relationType: row.relationType,
      });
    }
  }

  return adjacent;
}

/**
 * Traverse the relation graph to find related entries.
 * Uses recursive CTE for fast multi-hop queries, falls back to BFS if CTE fails.
 *
 * @param startType - Type of the starting node
 * @param startId - ID of the starting node
 * @param options - Traversal options (depth 1-5, direction, relationType, maxResults)
 * @param dbClient - Optional database client for dependency injection
 * @returns Entry IDs grouped by type (excluding the start node)
 */
export function traverseRelationGraph(
  startType: GraphNodeType,
  startId: string,
  options: {
    depth?: number;
    direction?: TraversalDirection;
    relationType?: RelationType;
    maxResults?: number;
  } = {},
  db?: DbClient
): Record<QueryEntryType, Set<string>> {
  // Try CTE-based traversal first (faster for multi-hop queries)
  // Falls back to BFS if CTE fails (e.g., SQLite version issues)
  const cteResult = traverseRelationGraphCTE(startType, startId, options);
  if (cteResult !== null) {
    return cteResult;
  }

  // BFS traversal fallback (reliable, with cycle detection)
  const result: Record<QueryEntryType, Set<string>> = {
    tool: new Set<string>(),
    guideline: new Set<string>(),
    knowledge: new Set<string>(),
    experience: new Set<string>(),
  };

  // Clamp depth to 1-5 range
  const maxDepth = Math.min(Math.max(options.depth ?? 1, 1), 5);
  const direction = options.direction ?? 'both';
  const maxResults = options.maxResults ?? 100;

  // BFS queue: [node, currentDepth]
  // Using index-based dequeue instead of shift() for O(1) performance
  const queue: Array<[GraphNode, number]> = [[{ type: startType, id: startId }, 0]];
  let queueHead = 0; // Index of next item to process (avoids O(n) shift())

  // Track visited nodes to prevent cycles: "type:id"
  const visited = new Set<string>();
  visited.add(`${startType}:${startId}`);

  let resultCount = 0;

  while (queueHead < queue.length && resultCount < maxResults) {
    const item = queue[queueHead++]; // O(1) dequeue instead of shift()'s O(n)
    if (!item) break;

    const [currentNode, currentDepth] = item;

    // Skip the start node from results (we want related entries, not the start)
    const isStartNode = currentNode.type === startType && currentNode.id === startId;

    // Add to results if not start node and is a query entry type
    if (!isStartNode) {
      const entryType = currentNode.type as QueryEntryType;
      if (entryType === 'tool' || entryType === 'guideline' || entryType === 'knowledge' || entryType === 'experience') {
        result[entryType].add(currentNode.id);
        resultCount++;

        if (resultCount >= maxResults) break;
      }
    }

    // Stop expanding if we've reached max depth
    if (currentDepth >= maxDepth) continue;

    // Get adjacent nodes (db is required for BFS fallback)
    const neighbors = db ? getAdjacentNodes(currentNode, direction, options.relationType, db) : [];

    for (const neighbor of neighbors) {
      const neighborKey = `${neighbor.type}:${neighbor.id}`;

      // Skip if already visited (cycle detection)
      if (visited.has(neighborKey)) continue;

      visited.add(neighborKey);
      queue.push([{ type: neighbor.type, id: neighbor.id }, currentDepth + 1]);
    }
  }

  return result;
}
