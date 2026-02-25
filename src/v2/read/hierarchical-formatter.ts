/**
 * V2 Hierarchical Context Formatter
 *
 * Transforms EntrySnapshot arrays into a compact hierarchical format
 * that reduces token usage from ~15k to ~1.5k tokens.
 *
 * Ported from v1 src/services/context/hierarchical-formatter.ts to work
 * with v2 EntrySnapshot instead of v1 QueryResultItem.
 */

import type { EntrySnapshot, EntryType, ScopeRef } from '../contracts/entry.js';

// ---------------------------------------------------------------------------
// Output types (self-contained, no dependency on v1 query-types)
// ---------------------------------------------------------------------------

export interface HierarchicalContextItem {
  id: string;
  type: EntryType;
  title: string;
  snippet: string;
  priority?: number;
  accessedAt?: string;
  category?: string;
}

export interface HierarchicalContextSummary {
  totalEntries: number;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
  lastUpdated: string;
}

export interface HierarchicalExpandActions {
  byCategory: { tool: string; example: Record<string, unknown> };
  bySearch: { tool: string; example: Record<string, unknown> };
  fullContext: { tool: string; example: Record<string, unknown> };
}

export interface HierarchicalContextResult {
  summary: HierarchicalContextSummary;
  critical: HierarchicalContextItem[];
  recent: HierarchicalContextItem[];
  workItems: HierarchicalContextItem[];
  categories: string[];
  expand: HierarchicalExpandActions;
  meta: {
    scopeType: string;
    scopeId: string | null;
    tokenSavings: string;
  };
}

// ---------------------------------------------------------------------------
// Snippet extraction (inlined — pure function, no v1 dependency)
// ---------------------------------------------------------------------------

function extractSnippet(content: string | null | undefined, maxLength = 150): string {
  if (!content) return '';

  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const sentences = normalized.split(/(?<=[.!?])\s+/);
  let snippet = '';

  for (const sentence of sentences) {
    if (snippet.length + sentence.length > maxLength) break;
    snippet += (snippet ? ' ' : '') + sentence;
  }

  if (snippet) {
    return snippet;
  }

  snippet = normalized.slice(0, maxLength);
  const lastSpace = snippet.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.7) {
    snippet = snippet.slice(0, lastSpace);
  }

  return snippet.trim() + '...';
}

// ---------------------------------------------------------------------------
// Main formatter
// ---------------------------------------------------------------------------

export function formatHierarchicalContext(
  entries: readonly EntrySnapshot[],
  scope: ScopeRef,
  totalCounts?: Partial<Record<EntryType, number>>
): HierarchicalContextResult {
  const summary = buildSummary(entries, totalCounts);
  const critical = extractCriticalItems(entries);
  const recent = extractRecentItems(entries);
  const workItems = extractWorkItems(entries);
  const categories = extractCategories(entries);
  const expand = buildExpandActions(scope);

  return {
    summary,
    critical,
    recent,
    workItems,
    categories,
    expand,
    meta: {
      scopeType: scope.type,
      scopeId: scope.id,
      tokenSavings: '~90% reduction (1.5k vs 15k tokens)',
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildSummary(
  entries: readonly EntrySnapshot[],
  totalCounts?: Partial<Record<EntryType, number>>
): HierarchicalContextSummary {
  const byType: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  let latestUpdate = '';

  if (totalCounts) {
    for (const [type, count] of Object.entries(totalCounts)) {
      if (count && count > 0) {
        byType[type] = count;
      }
    }
  }

  for (const entry of entries) {
    if (!totalCounts) {
      byType[entry.ref.type] = (byType[entry.ref.type] ?? 0) + 1;
    }

    if (entry.category) {
      byCategory[entry.category] = (byCategory[entry.category] ?? 0) + 1;
    }

    const ts = entry.updatedAt || entry.createdAt;
    if (ts && ts > latestUpdate) {
      latestUpdate = ts;
    }
  }

  const totalEntries = totalCounts
    ? Object.values(totalCounts).reduce((sum, n) => sum + (n ?? 0), 0)
    : entries.length;

  return {
    totalEntries,
    byType,
    byCategory,
    lastUpdated: latestUpdate || new Date().toISOString(),
  };
}

function extractCriticalItems(entries: readonly EntrySnapshot[]): HierarchicalContextItem[] {
  return entries
    .filter((e) => e.ref.type === 'guideline' && (e.priority ?? 50) >= 90)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, 5)
    .map((e) => ({
      id: e.ref.id,
      type: e.ref.type,
      title: e.title,
      snippet: extractSnippet(e.content),
      priority: e.priority ?? undefined,
      category: e.category ?? undefined,
    }));
}

function extractRecentItems(entries: readonly EntrySnapshot[]): HierarchicalContextItem[] {
  const sorted = [...entries].sort((a, b) => {
    const aTs = a.updatedAt || a.createdAt || '';
    const bTs = b.updatedAt || b.createdAt || '';
    return bTs.localeCompare(aTs);
  });

  return sorted.slice(0, 5).map((e) => ({
    id: e.ref.id,
    type: e.ref.type,
    title: e.title,
    snippet: extractSnippet(e.content),
    accessedAt: e.updatedAt || e.createdAt,
    category: e.category ?? undefined,
  }));
}

const WORK_ITEM_PREFIXES = ['[TODO]', '[BUG]', '[LIMITATION]', '[FIXME]', '[WIP]'];

function extractWorkItems(entries: readonly EntrySnapshot[]): HierarchicalContextItem[] {
  return entries
    .filter((e) => WORK_ITEM_PREFIXES.some((p) => e.title.toUpperCase().startsWith(p)))
    .sort((a, b) => {
      const priority = (title: string): number => {
        const upper = title.toUpperCase();
        if (upper.startsWith('[BUG]')) return 5;
        if (upper.startsWith('[TODO]')) return 4;
        if (upper.startsWith('[FIXME]')) return 3;
        if (upper.startsWith('[LIMITATION]')) return 2;
        if (upper.startsWith('[WIP]')) return 1;
        return 0;
      };
      return priority(b.title) - priority(a.title);
    })
    .slice(0, 10)
    .map((e) => ({
      id: e.ref.id,
      type: e.ref.type,
      title: e.title,
      snippet: extractSnippet(e.content),
      accessedAt: e.updatedAt || e.createdAt,
      category: e.category ?? undefined,
    }));
}

function extractCategories(entries: readonly EntrySnapshot[]): string[] {
  const categories = new Set<string>();
  for (const entry of entries) {
    if (entry.category) {
      categories.add(entry.category);
    }
  }
  return Array.from(categories).sort();
}

function buildExpandActions(scope: ScopeRef): HierarchicalExpandActions {
  const scopeParams: Record<string, unknown> = {
    scope: { type: scope.type, id: scope.id },
  };

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
        query: '<keyword>',
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
