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
 * @param totalCounts - Optional total counts from pipeline (accurate DB counts, not limited)
 * @returns Compact hierarchical response with summary, critical items, and expand hints
 */
export function formatHierarchicalContext(
  results: QueryResultItem[],
  scopeType: string,
  scopeId: string | null,
  totalCounts?: {
    tool?: number;
    guideline?: number;
    knowledge?: number;
    experience?: number;
  }
): HierarchicalContextResult {
  const summary = buildSummary(results, totalCounts);
  const critical = extractCriticalItems(results);
  const recent = extractRecentItems(results);
  const workItems = extractWorkItems(results);
  const categories = extractCategories(results);
  const expand = buildExpandActions(scopeType, scopeId);

  return {
    summary,
    critical,
    recent,
    workItems,
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
 * @param results - Query results (may be limited by pagination)
 * @param totalCounts - Optional accurate counts from DB (not limited)
 */
function buildSummary(
  results: QueryResultItem[],
  totalCounts?: {
    tool?: number;
    guideline?: number;
    knowledge?: number;
    experience?: number;
  }
): HierarchicalContextSummary {
  // Use totalCounts if provided (accurate DB counts), otherwise count from results
  const byType: Record<string, number> = totalCounts
    ? {
        ...(totalCounts.tool !== undefined && totalCounts.tool > 0
          ? { tool: totalCounts.tool }
          : {}),
        ...(totalCounts.guideline !== undefined && totalCounts.guideline > 0
          ? { guideline: totalCounts.guideline }
          : {}),
        ...(totalCounts.knowledge !== undefined && totalCounts.knowledge > 0
          ? { knowledge: totalCounts.knowledge }
          : {}),
        ...(totalCounts.experience !== undefined && totalCounts.experience > 0
          ? { experience: totalCounts.experience }
          : {}),
      }
    : {};

  const byCategory: Record<string, number> = {};
  let latestUpdate = '';

  for (const r of results) {
    // Only count from results if totalCounts not provided
    if (!totalCounts) {
      byType[r.type] = (byType[r.type] || 0) + 1;
    }

    // Count by category (always from results since totalCounts doesn't include categories)
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

  // Calculate total from accurate counts if available
  const totalEntries = totalCounts
    ? (totalCounts.tool ?? 0) +
      (totalCounts.guideline ?? 0) +
      (totalCounts.knowledge ?? 0) +
      (totalCounts.experience ?? 0)
    : results.length;

  return {
    totalEntries,
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
 * Work item prefixes that indicate actionable items
 */
const WORK_ITEM_PREFIXES = ['[TODO]', '[BUG]', '[LIMITATION]', '[FIXME]', '[WIP]'];

/**
 * Extract work items - entries with actionable prefixes in title
 * These represent pending work, bugs, limitations, etc.
 */
function extractWorkItems(results: QueryResultItem[]): HierarchicalContextItem[] {
  return results
    .filter((r) => {
      const title = getItemTitle(r);
      return WORK_ITEM_PREFIXES.some((prefix) =>
        title.toUpperCase().startsWith(prefix)
      );
    })
    .sort((a, b) => {
      // Sort by prefix priority: BUG > TODO > LIMITATION > FIXME > WIP
      const prefixPriority = (title: string): number => {
        const upper = title.toUpperCase();
        if (upper.startsWith('[BUG]')) return 5;
        if (upper.startsWith('[TODO]')) return 4;
        if (upper.startsWith('[FIXME]')) return 3;
        if (upper.startsWith('[LIMITATION]')) return 2;
        if (upper.startsWith('[WIP]')) return 1;
        return 0;
      };
      return prefixPriority(getItemTitle(b)) - prefixPriority(getItemTitle(a));
    })
    .slice(0, 10)
    .map((r) => ({
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
