/**
 * Graph Traversal Using Edges Table
 *
 * New implementation that uses the edges table instead of entry_relations.
 * Uses nodes.entry_id and nodes.entry_type for bidirectional mapping.
 *
 * Enabled by AGENT_MEMORY_GRAPH_TRAVERSAL=true config flag.
 */

import { getPreparedStatement as getGlobalPreparedStatement } from '../../db/connection.js';
import { createComponentLogger } from '../../utils/logger.js';
import type { Statement } from 'better-sqlite3';
import type { RelationType } from '../../db/schema.js';

const logger = createComponentLogger('graph-traversal:edges');

/**
 * Type for getPreparedStatement function
 */
export type GetPreparedStatementFn = (sql: string) => Statement;

// Module-level variable to support injected getPreparedStatement
let injectedGetPreparedStatement: GetPreparedStatementFn | null = null;

/**
 * Get the active getPreparedStatement function (injected or global)
 */
function getPreparedStatement(sql: string): Statement {
  if (injectedGetPreparedStatement) {
    return injectedGetPreparedStatement(sql);
  }
  return getGlobalPreparedStatement(sql);
}

// =============================================================================
// EDGE-BASED CTE QUERIES
// =============================================================================

/**
 * Forward traversal without edge type filter
 * Uses edges + nodes tables with entry_id/entry_type mapping
 */
const CTE_EDGES_FORWARD_NO_FILTER = `
  WITH RECURSIVE reachable(node_id, entry_type, entry_id, depth) AS (
    -- Base case: find starting node by entry
    SELECT n.id, n.entry_type, n.entry_id, 0
    FROM nodes n
    WHERE n.entry_type = ? AND n.entry_id = ?

    UNION

    -- Recursive case: follow outgoing edges
    SELECT target.id, target.entry_type, target.entry_id, r.depth + 1
    FROM edges e
    JOIN reachable r ON e.source_id = r.node_id
    JOIN nodes target ON e.target_id = target.id
    WHERE r.depth < ?
      AND target.entry_type IS NOT NULL
      AND target.entry_id IS NOT NULL
  )
  SELECT DISTINCT entry_type AS node_type, entry_id AS node_id
  FROM reachable
  WHERE depth > 0
    AND entry_type IN ('tool', 'guideline', 'knowledge', 'experience')
  LIMIT ?
`;

/**
 * Forward traversal with edge type filter
 */
const CTE_EDGES_FORWARD_WITH_FILTER = `
  WITH RECURSIVE reachable(node_id, entry_type, entry_id, depth) AS (
    SELECT n.id, n.entry_type, n.entry_id, 0
    FROM nodes n
    WHERE n.entry_type = ? AND n.entry_id = ?

    UNION

    SELECT target.id, target.entry_type, target.entry_id, r.depth + 1
    FROM edges e
    JOIN edge_types et ON e.edge_type_id = et.id
    JOIN reachable r ON e.source_id = r.node_id
    JOIN nodes target ON e.target_id = target.id
    WHERE r.depth < ?
      AND et.name = ?
      AND target.entry_type IS NOT NULL
      AND target.entry_id IS NOT NULL
  )
  SELECT DISTINCT entry_type AS node_type, entry_id AS node_id
  FROM reachable
  WHERE depth > 0
    AND entry_type IN ('tool', 'guideline', 'knowledge', 'experience')
  LIMIT ?
`;

/**
 * Backward traversal without edge type filter
 */
const CTE_EDGES_BACKWARD_NO_FILTER = `
  WITH RECURSIVE reachable(node_id, entry_type, entry_id, depth) AS (
    SELECT n.id, n.entry_type, n.entry_id, 0
    FROM nodes n
    WHERE n.entry_type = ? AND n.entry_id = ?

    UNION

    SELECT source.id, source.entry_type, source.entry_id, r.depth + 1
    FROM edges e
    JOIN reachable r ON e.target_id = r.node_id
    JOIN nodes source ON e.source_id = source.id
    WHERE r.depth < ?
      AND source.entry_type IS NOT NULL
      AND source.entry_id IS NOT NULL
  )
  SELECT DISTINCT entry_type AS node_type, entry_id AS node_id
  FROM reachable
  WHERE depth > 0
    AND entry_type IN ('tool', 'guideline', 'knowledge', 'experience')
  LIMIT ?
`;

/**
 * Backward traversal with edge type filter
 */
const CTE_EDGES_BACKWARD_WITH_FILTER = `
  WITH RECURSIVE reachable(node_id, entry_type, entry_id, depth) AS (
    SELECT n.id, n.entry_type, n.entry_id, 0
    FROM nodes n
    WHERE n.entry_type = ? AND n.entry_id = ?

    UNION

    SELECT source.id, source.entry_type, source.entry_id, r.depth + 1
    FROM edges e
    JOIN edge_types et ON e.edge_type_id = et.id
    JOIN reachable r ON e.target_id = r.node_id
    JOIN nodes source ON e.source_id = source.id
    WHERE r.depth < ?
      AND et.name = ?
      AND source.entry_type IS NOT NULL
      AND source.entry_id IS NOT NULL
  )
  SELECT DISTINCT entry_type AS node_type, entry_id AS node_id
  FROM reachable
  WHERE depth > 0
    AND entry_type IN ('tool', 'guideline', 'knowledge', 'experience')
  LIMIT ?
`;

/**
 * Bidirectional traversal without edge type filter
 */
const CTE_EDGES_BOTH_NO_FILTER = `
  WITH RECURSIVE reachable(node_id, entry_type, entry_id, depth) AS (
    SELECT n.id, n.entry_type, n.entry_id, 0
    FROM nodes n
    WHERE n.entry_type = ? AND n.entry_id = ?

    UNION

    SELECT target.id, target.entry_type, target.entry_id, r.depth + 1
    FROM edges e
    JOIN reachable r ON e.source_id = r.node_id
    JOIN nodes target ON e.target_id = target.id
    WHERE r.depth < ?
      AND target.entry_type IS NOT NULL
      AND target.entry_id IS NOT NULL

    UNION

    SELECT source.id, source.entry_type, source.entry_id, r.depth + 1
    FROM edges e
    JOIN reachable r ON e.target_id = r.node_id
    JOIN nodes source ON e.source_id = source.id
    WHERE r.depth < ?
      AND source.entry_type IS NOT NULL
      AND source.entry_id IS NOT NULL
  )
  SELECT DISTINCT entry_type AS node_type, entry_id AS node_id
  FROM reachable
  WHERE depth > 0
    AND entry_type IN ('tool', 'guideline', 'knowledge', 'experience')
  LIMIT ?
`;

/**
 * Bidirectional traversal with edge type filter
 */
const CTE_EDGES_BOTH_WITH_FILTER = `
  WITH RECURSIVE reachable(node_id, entry_type, entry_id, depth) AS (
    SELECT n.id, n.entry_type, n.entry_id, 0
    FROM nodes n
    WHERE n.entry_type = ? AND n.entry_id = ?

    UNION

    SELECT target.id, target.entry_type, target.entry_id, r.depth + 1
    FROM edges e
    JOIN edge_types et ON e.edge_type_id = et.id
    JOIN reachable r ON e.source_id = r.node_id
    JOIN nodes target ON e.target_id = target.id
    WHERE r.depth < ?
      AND et.name = ?
      AND target.entry_type IS NOT NULL
      AND target.entry_id IS NOT NULL

    UNION

    SELECT source.id, source.entry_type, source.entry_id, r.depth + 1
    FROM edges e
    JOIN edge_types et ON e.edge_type_id = et.id
    JOIN reachable r ON e.target_id = r.node_id
    JOIN nodes source ON e.source_id = source.id
    WHERE r.depth < ?
      AND et.name = ?
      AND source.entry_type IS NOT NULL
      AND source.entry_id IS NOT NULL
  )
  SELECT DISTINCT entry_type AS node_type, entry_id AS node_id
  FROM reachable
  WHERE depth > 0
    AND entry_type IN ('tool', 'guideline', 'knowledge', 'experience')
  LIMIT ?
`;

// =============================================================================
// TYPES
// =============================================================================

export type QueryEntryType = 'tool' | 'guideline' | 'knowledge' | 'experience';
type GraphNodeType = 'tool' | 'guideline' | 'knowledge' | 'project' | 'experience';
type TraversalDirection = 'forward' | 'backward' | 'both';

/**
 * Select the appropriate edge-based CTE query
 */
function selectEdgeCTEQuery(direction: TraversalDirection, hasFilter: boolean): string | null {
  if (direction === 'forward') {
    return hasFilter ? CTE_EDGES_FORWARD_WITH_FILTER : CTE_EDGES_FORWARD_NO_FILTER;
  } else if (direction === 'backward') {
    return hasFilter ? CTE_EDGES_BACKWARD_WITH_FILTER : CTE_EDGES_BACKWARD_NO_FILTER;
  } else if (direction === 'both') {
    return hasFilter ? CTE_EDGES_BOTH_WITH_FILTER : CTE_EDGES_BOTH_NO_FILTER;
  }
  return null;
}

// =============================================================================
// TRAVERSAL FUNCTION
// =============================================================================

/**
 * Traverse graph using edges table with entry_id mapping
 *
 * @param startType - Entry type of starting node
 * @param startId - Entry ID of starting node
 * @param options - Traversal options
 * @returns Entry IDs grouped by type
 */
export function traverseGraphEdges(
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
    // Select appropriate query
    const cteQuery = selectEdgeCTEQuery(direction, hasFilter);
    if (!cteQuery) {
      return null;
    }

    // Build parameters array
    const params: (string | number)[] = [startType, startId];

    if (direction === 'forward') {
      params.push(maxDepth);
      if (hasFilter) params.push(relationType!);
    } else if (direction === 'backward') {
      params.push(maxDepth);
      if (hasFilter) params.push(relationType!);
    } else if (direction === 'both') {
      params.push(maxDepth);
      if (hasFilter) params.push(relationType!);
      params.push(maxDepth);
      if (hasFilter) params.push(relationType!);
    }

    params.push(maxResults);

    // Execute query
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

    // Log truncation warning
    if (rows.length >= maxResults) {
      logger.warn(
        {
          startType,
          startId,
          maxResults,
          actualCount: rows.length,
          truncated: true,
          resultCounts: {
            tool: result.tool.size,
            guideline: result.guideline.size,
            knowledge: result.knowledge.size,
            experience: result.experience.size,
          },
        },
        'Graph traversal (edges) truncated - consider increasing maxResults'
      );
    }

    return result;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), startType, startId },
      'Edge-based graph traversal failed'
    );
    return null;
  }
}

/**
 * Inject a custom getPreparedStatement function for testing
 */
export function injectGetPreparedStatement(fn: GetPreparedStatementFn | null): void {
  injectedGetPreparedStatement = fn;
}
