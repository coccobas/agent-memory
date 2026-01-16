/**
 * Hierarchical Context Formatter
 *
 * Transforms query results into a compact hierarchical format that reduces
 * token usage from ~15k to ~1.5k tokens while preserving essential information.
 */

import {
  extractSnippet,
  getItemTitle,
  getItemContent,
  getItemCategory,
  getItemCreatedAt,
} from '../../utils/snippet.js';
import type { QueryResultItem } from '../query/pipeline.js';
import type {
  HierarchicalContextResult,
  HierarchicalContextItem,
  HierarchicalContextSummary,
  HierarchicalExpandActions,
  HierarchicalEntryType,
} from '../../core/query-types.js';

/**
 * Format query results into hierarchical context response
 *
 * @param results - Array of query result items from the pipeline
 * @param scopeType - The scope type used in the query
 * @param scopeId - The scope ID used in the query (if any)
 * @returns Compact hierarchical response with summary, critical items, and expand hints
 */
export function formatHierarchicalContext(
  results: QueryResultItem[],
  scopeType: string,
  scopeId: string | null
): HierarchicalContextResult {
  const summary = buildSummary(results);
  const critical = extractCriticalItems(results);
  const recent = extractRecentItems(results);
  const categories = extractCategories(results);
  const expand = buildExpandActions(scopeType, scopeId);

  return {
    summary,
    critical,
    recent,
    categories,
    expand,
    meta: {
      scopeType,
      scopeId,
      tokenSavings: '~90% reduction (1.5k vs 15k tokens)',
    },
  };
}

/**
 * Build summary statistics from query results
 */
function buildSummary(results: QueryResultItem[]): HierarchicalContextSummary {
  const byType: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  let latestUpdate = '';

  for (const r of results) {
    // Count by type
    byType[r.type] = (byType[r.type] || 0) + 1;

    // Count by category
    const category = getItemCategory(r);
    if (category) {
      byCategory[category] = (byCategory[category] || 0) + 1;
    }

    // Track latest update (using createdAt since entries may not have updatedAt)
    const createdAt = getItemCreatedAt(r);
    if (createdAt && createdAt > latestUpdate) {
      latestUpdate = createdAt;
    }
  }

  return {
    totalEntries: results.length,
    byType,
    byCategory,
    lastUpdated: latestUpdate || new Date().toISOString(),
  };
}

/**
 * Extract critical items (high-priority guidelines)
 * Critical items are guidelines with priority >= 90
 */
function extractCriticalItems(results: QueryResultItem[]): HierarchicalContextItem[] {
  return results
    .filter(
      (r): r is QueryResultItem & { type: 'guideline' } =>
        r.type === 'guideline' && (r.guideline?.priority ?? 50) >= 90
    )
    .sort((a, b) => (b.guideline?.priority ?? 0) - (a.guideline?.priority ?? 0))
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      type: r.type as HierarchicalEntryType,
      title: getItemTitle(r),
      snippet: extractSnippet(getItemContent(r)),
      priority: r.guideline?.priority,
      category: getItemCategory(r),
    }));
}

/**
 * Extract recent items based on recency score or creation timestamp
 */
function extractRecentItems(results: QueryResultItem[]): HierarchicalContextItem[] {
  // Sort by recency score if available, otherwise by createdAt
  const sorted = [...results].sort((a, b) => {
    // Prefer recency score if available
    if (a.recencyScore !== undefined && b.recencyScore !== undefined) {
      return b.recencyScore - a.recencyScore;
    }

    // Fall back to createdAt comparison
    const aCreated = getItemCreatedAt(a) || '';
    const bCreated = getItemCreatedAt(b) || '';
    return bCreated.localeCompare(aCreated);
  });

  return sorted.slice(0, 5).map((r) => ({
    id: r.id,
    type: r.type as HierarchicalEntryType,
    title: getItemTitle(r),
    snippet: extractSnippet(getItemContent(r)),
    accessedAt: getItemCreatedAt(r),
    category: getItemCategory(r),
  }));
}

/**
 * Extract unique categories from results
 */
function extractCategories(results: QueryResultItem[]): string[] {
  const categories = new Set<string>();

  for (const r of results) {
    const category = getItemCategory(r);
    if (category) {
      categories.add(category);
    }
  }

  return Array.from(categories).sort();
}

/**
 * Build expand action hints for drilling down
 */
function buildExpandActions(scopeType: string, scopeId: string | null): HierarchicalExpandActions {
  const scopeParams: Record<string, unknown> = { scopeType };
  if (scopeId) {
    scopeParams.scopeId = scopeId;
  }

  return {
    byCategory: {
      tool: 'memory_query',
      example: {
        action: 'search',
        ...scopeParams,
        tags: { include: ['<category>'] },
      },
    },
    bySearch: {
      tool: 'memory_query',
      example: {
        action: 'search',
        ...scopeParams,
        search: '<keyword>',
      },
    },
    fullContext: {
      tool: 'memory_query',
      example: {
        action: 'context',
        ...scopeParams,
        hierarchical: false,
      },
    },
  };
}
