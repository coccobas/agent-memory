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
// TYPES
// =============================================================================

export type QueryEntryType = 'tool' | 'guideline' | 'knowledge';
type GraphNodeType = 'tool' | 'guideline' | 'knowledge' | 'project';
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

  try {
    // Build the recursive CTE query based on direction
    let forwardUnion = '';
    let backwardUnion = '';

    if (direction === 'forward' || direction === 'both') {
      forwardUnion = `
        SELECT r.target_type, r.target_id, g.depth + 1
        FROM entry_relations r
        JOIN reachable g ON r.source_type = g.node_type AND r.source_id = g.node_id
        WHERE g.depth < ?
        ${relationType ? `AND r.relation_type = ?` : ''}
      `;
    }

    if (direction === 'backward' || direction === 'both') {
      backwardUnion = `
        SELECT r.source_type, r.source_id, g.depth + 1
        FROM entry_relations r
        JOIN reachable g ON r.target_type = g.node_type AND r.target_id = g.node_id
        WHERE g.depth < ?
        ${relationType ? `AND r.relation_type = ?` : ''}
      `;
    }

    // Combine unions
    let recursivePart = '';
    if (forwardUnion && backwardUnion) {
      recursivePart = `${forwardUnion} UNION ${backwardUnion}`;
    } else if (forwardUnion) {
      recursivePart = forwardUnion;
    } else if (backwardUnion) {
      recursivePart = backwardUnion;
    } else {
      return null; // No direction specified
    }

    const cteQuery = `
      WITH RECURSIVE reachable(node_type, node_id, depth) AS (
        -- Base case: start node at depth 0
        SELECT ?, ?, 0
        UNION
        -- Recursive case: traverse relations
        ${recursivePart}
      )
      SELECT DISTINCT node_type, node_id
      FROM reachable
      WHERE (node_type != ? OR node_id != ?)
        AND node_type IN ('tool', 'guideline', 'knowledge')
      LIMIT ?
    `;

    // Build parameters array
    const params: (string | number)[] = [startType, startId];

    // Add depth parameters for each direction
    if (direction === 'forward' || direction === 'both') {
      params.push(maxDepth);
      if (relationType) params.push(relationType);
    }
    if (direction === 'backward' || direction === 'both') {
      params.push(maxDepth);
      if (relationType) params.push(relationType);
    }

    // Add WHERE clause parameters
    params.push(startType, startId, maxResults);

    // Execute the CTE query
    const stmt = getPreparedStatement(cteQuery);
    const rows = stmt.all(...params) as Array<{ node_type: string; node_id: string }>;

    // Group results by type
    const result: Record<QueryEntryType, Set<string>> = {
      tool: new Set<string>(),
      guideline: new Set<string>(),
      knowledge: new Set<string>(),
    };

    for (const row of rows) {
      const nodeType = row.node_type as QueryEntryType;
      if (nodeType === 'tool' || nodeType === 'guideline' || nodeType === 'knowledge') {
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
  };

  // Clamp depth to 1-5 range
  const maxDepth = Math.min(Math.max(options.depth ?? 1, 1), 5);
  const direction = options.direction ?? 'both';
  const maxResults = options.maxResults ?? 100;

  // BFS queue: [node, currentDepth]
  const queue: Array<[GraphNode, number]> = [[{ type: startType, id: startId }, 0]];

  // Track visited nodes to prevent cycles: "type:id"
  const visited = new Set<string>();
  visited.add(`${startType}:${startId}`);

  let resultCount = 0;

  while (queue.length > 0 && resultCount < maxResults) {
    const item = queue.shift();
    if (!item) break;

    const [currentNode, currentDepth] = item;

    // Skip the start node from results (we want related entries, not the start)
    const isStartNode = currentNode.type === startType && currentNode.id === startId;

    // Add to results if not start node and is a query entry type
    if (!isStartNode) {
      const entryType = currentNode.type as QueryEntryType;
      if (entryType === 'tool' || entryType === 'guideline' || entryType === 'knowledge') {
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
