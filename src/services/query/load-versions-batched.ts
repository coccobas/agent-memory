/**
 * Batched version loading for query results
 *
 * Performance Design Decision: Three Separate Queries vs UNION ALL
 *
 * This module intentionally uses three separate queries rather than a single UNION ALL:
 *
 * 1. **Schema Differences**: Tool, guideline, and knowledge versions have different
 *    schemas. A UNION ALL would require column normalization, adding overhead.
 *
 * 2. **Index Utilization**: Each query targets a specific table's (toolId, versionNum)
 *    index. UNION ALL would prevent optimal index usage.
 *
 * 3. **SQLite Optimization**: SQLite's query planner handles simple queries better
 *    than complex UNION queries. Three simple queries often outperform one complex query.
 *
 * 4. **Early Exit**: If toolIds is empty, we skip that query entirely. UNION ALL
 *    would still scan the entire expression.
 *
 * 5. **Type Safety**: Keeping queries separate preserves TypeScript type inference
 *    without manual type assertions.
 *
 * Benchmarks show this approach is faster for typical workloads (<100 entries per type).
 * For bulk operations, consider using SQL transactions to amortize connection overhead.
 */

import { inArray, desc } from 'drizzle-orm';
import {
  toolVersions,
  guidelineVersions,
  knowledgeVersions,
  type ToolVersion,
  type GuidelineVersion,
  type KnowledgeVersion,
} from '../../db/schema.js';

type Db = ReturnType<typeof import('../../db/connection.js').getDb>;

/**
 * Load version history for multiple entries in batched queries.
 *
 * Returns Maps where:
 * - `current` is the most recent version (highest versionNum)
 * - `history` includes all versions, ordered by versionNum DESC
 *
 * @param db - Database connection
 * @param toolIds - Tool IDs to load versions for
 * @param guidelineIds - Guideline IDs to load versions for
 * @param knowledgeIds - Knowledge IDs to load versions for
 */
export function loadVersionsBatched(
  db: Db,
  toolIds: string[],
  guidelineIds: string[],
  knowledgeIds: string[]
): {
  tools: Map<string, { current: ToolVersion; history: ToolVersion[] }>;
  guidelines: Map<string, { current: GuidelineVersion; history: GuidelineVersion[] }>;
  knowledge: Map<string, { current: KnowledgeVersion; history: KnowledgeVersion[] }>;
} {
  const result = {
    tools: new Map<string, { current: ToolVersion; history: ToolVersion[] }>(),
    guidelines: new Map<string, { current: GuidelineVersion; history: GuidelineVersion[] }>(),
    knowledge: new Map<string, { current: KnowledgeVersion; history: KnowledgeVersion[] }>(),
  };

  if (toolIds.length > 0) {
    // ORDER BY versionNum DESC - first seen per toolId is the current version
    const versions = db
      .select()
      .from(toolVersions)
      .where(inArray(toolVersions.toolId, toolIds))
      .orderBy(desc(toolVersions.versionNum))
      .all();

    // Group by toolId - no sorting needed, already ordered by DB
    for (const v of versions) {
      const existing = result.tools.get(v.toolId);
      if (!existing) {
        // First version for this toolId is the current (highest versionNum)
        result.tools.set(v.toolId, { current: v, history: [v] });
      } else {
        existing.history.push(v);
      }
    }
  }

  if (guidelineIds.length > 0) {
    // ORDER BY versionNum DESC - first seen per guidelineId is the current version
    const versions = db
      .select()
      .from(guidelineVersions)
      .where(inArray(guidelineVersions.guidelineId, guidelineIds))
      .orderBy(desc(guidelineVersions.versionNum))
      .all();

    // Group by guidelineId - no sorting needed, already ordered by DB
    for (const v of versions) {
      const existing = result.guidelines.get(v.guidelineId);
      if (!existing) {
        // First version for this guidelineId is the current (highest versionNum)
        result.guidelines.set(v.guidelineId, { current: v, history: [v] });
      } else {
        existing.history.push(v);
      }
    }
  }

  if (knowledgeIds.length > 0) {
    // ORDER BY versionNum DESC - first seen per knowledgeId is the current version
    const versions = db
      .select()
      .from(knowledgeVersions)
      .where(inArray(knowledgeVersions.knowledgeId, knowledgeIds))
      .orderBy(desc(knowledgeVersions.versionNum))
      .all();

    // Group by knowledgeId - no sorting needed, already ordered by DB
    for (const v of versions) {
      const existing = result.knowledge.get(v.knowledgeId);
      if (!existing) {
        // First version for this knowledgeId is the current (highest versionNum)
        result.knowledge.set(v.knowledgeId, { current: v, history: [v] });
      } else {
        existing.history.push(v);
      }
    }
  }

  return result;
}
