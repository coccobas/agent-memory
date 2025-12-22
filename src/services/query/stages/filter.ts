/**
 * Filter Stage
 *
 * Applies filtering logic to fetched entries:
 * - Deduplication by (scopeType, scopeId, name/title)
 * - Tag filtering
 * - Relation filtering
 * - FTS5 filtering
 * - Text search filtering (regex, fuzzy, exact)
 * - Date range filtering
 * - Priority filtering (guidelines)
 *
 * Uses injected dependencies for DB access to support testing with mocks.
 */

import type { PipelineContext, QueryType, QueryEntryType } from '../pipeline.js';
import type { Guideline, Tag } from '../../../db/schema.js';
import type { EntryUnion, FilteredEntry, FilterStageResult } from '../types.js';
import { getEntryKeyValue, QUERY_TYPE_TO_TABLE_NAME } from '../type-maps.js';
import { textMatches, fuzzyTextMatches, regexTextMatches } from '../../../utils/text-matching.js';
import { filterByTags } from './tags.js';

interface DedupedEntry<T> {
  entry: T;
  scopeIndex: number;
}

// getEntryKeyValue is imported from ../type-maps.js

/**
 * Deduplicate entries by (scopeType, scopeId, name/title)
 * Keeps the entry from the most specific scope (lowest scopeIndex)
 */
function deduplicateEntries<T extends EntryUnion>(
  entries: Array<{ entry: T; scopeIndex: number }>,
  type: QueryType
): Array<DedupedEntry<T>> {
  const dedupMap = new Map<string, DedupedEntry<T>>();

  for (const item of entries) {
    const entry = item.entry;
    const keyName = getEntryKeyValue(entry, type);
    const key = `${entry.scopeType}:${entry.scopeId ?? ''}:${keyName}`;
    const existing = dedupMap.get(key);
    if (!existing || item.scopeIndex < existing.scopeIndex) {
      dedupMap.set(key, item);
    }
  }

  return Array.from(dedupMap.values());
}

// Text matching functions (textMatches, fuzzyTextMatches, regexTextMatches)
// are imported from ../../../utils/text-matching.js

/**
 * Date range check
 */
function dateInRange(
  date: string | null | undefined,
  after: string | undefined,
  before: string | undefined
): boolean {
  if (!date) return !after && !before; // No date: pass if no constraints
  if (after && date < after) return false;
  if (before && date > before) return false;
  return true;
}

/**
 * Priority range check
 */
function priorityInRange(
  priority: number | null | undefined,
  min: number | undefined,
  max: number | undefined
): boolean {
  if (priority === null || priority === undefined) return true;
  if (min !== undefined && priority < min) return false;
  if (max !== undefined && priority > max) return false;
  return true;
}

// FilteredEntry is imported from ../types.js

/**
 * Filter entries of a single type
 */
function filterEntriesOfType<T extends EntryUnion>(
  entries: Array<{ entry: T; scopeIndex: number }>,
  type: QueryType,
  entryType: QueryEntryType,
  ctx: PipelineContext
): FilteredEntry<T>[] {
  const { params, tagsByEntry, relatedIds, ftsMatchIds, search } = ctx;

  // Deduplicate first
  const deduped = deduplicateEntries(entries, type);
  const entryIds = deduped.map((d) => d.entry.id);

  if (entryIds.length === 0) return [];

  // Build filter sets
  let allowedByTags: Set<string> | null = null;
  if (params.tags) {
    // Filter tagsByEntry to only include relevant entries
    const relevantTags: Record<string, Tag[]> = {};
    for (const id of entryIds) {
      if (tagsByEntry[id]) {
        relevantTags[id] = tagsByEntry[id];
      }
    }
    allowedByTags = filterByTags(relevantTags, params.tags);
  }

  let allowedByRelation: Set<string> | null = null;
  if (params.relatedTo) {
    allowedByRelation = relatedIds[entryType];
  }

  let allowedByFts5: Set<string> | null = null;
  if (ftsMatchIds) {
    allowedByFts5 = ftsMatchIds[entryType];
  }

  // Get FTS5 matching rowids for text search using injected dependency
  const useFts5 = params.useFts5 === true && search;
  let fts5MatchingRowids: Set<number> | null = null;
  let rowidMap: Map<string, number> | null = null;

  if (useFts5) {
    fts5MatchingRowids = ctx.deps.executeFts5Query(entryType, search, params.fields);

    if (fts5MatchingRowids && fts5MatchingRowids.size > 0 && entryIds.length > 0) {
      const tableName = QUERY_TYPE_TO_TABLE_NAME[type];
      const placeholders = entryIds.map(() => '?').join(',');
      const batchRowidQuery = ctx.deps.getPreparedStatement(
        `SELECT id, rowid FROM ${tableName} WHERE id IN (${placeholders})`
      );
      const rowidResults = batchRowidQuery.all(...entryIds) as Array<{ id: string; rowid: number }>;
      rowidMap = new Map(rowidResults.map((r) => [r.id, r.rowid]));
    }
  }

  const matchFunc = params.regex ? regexTextMatches : params.fuzzy ? fuzzyTextMatches : textMatches;

  const filtered: FilteredEntry<T>[] = [];

  for (const { entry, scopeIndex } of deduped) {
    const id = entry.id;
    const entryTags = tagsByEntry[id] ?? [];

    // Tag filter
    if (allowedByTags && !allowedByTags.has(id)) continue;

    // Relation filter
    if (allowedByRelation && !allowedByRelation.has(id)) continue;

    // FTS5 filter
    if (allowedByFts5 && !allowedByFts5.has(id)) continue;

    // Date filter (createdAt)
    if (params.createdAfter || params.createdBefore) {
      if (!dateInRange(entry.createdAt, params.createdAfter, params.createdBefore)) {
        continue;
      }
    }

    // Priority filter (guidelines only)
    if (type === 'guidelines' && params.priority) {
      const guidelineEntry = entry as Guideline;
      if (!priorityInRange(guidelineEntry.priority, params.priority.min, params.priority.max)) {
        continue;
      }
    }

    // Text search
    let textMatched = false;
    if (search) {
      if (useFts5 && fts5MatchingRowids && rowidMap) {
        const rowid = rowidMap.get(id);
        if (rowid !== undefined && fts5MatchingRowids.has(rowid)) {
          textMatched = true;
        }
      } else {
        // Regular text matching - use the name/title field based on type
        const searchField = getEntryKeyValue(entry, type);
        textMatched = matchFunc(searchField, search);
      }

      if (!textMatched) continue;
    }

    // Compute tag match count
    const matchingTagCount = (() => {
      if (!params.tags?.include || params.tags.include.length === 0) return 0;
      const includeNames = new Set(params.tags.include.map((t) => t.toLowerCase()));
      let count = 0;
      for (const tag of entryTags) {
        if (includeNames.has(tag.name.toLowerCase())) count++;
      }
      return count;
    })();

    // Check explicit relation
    const hasExplicitRelation = !!params.relatedTo && relatedIds[entryType].has(id);

    filtered.push({
      entry,
      scopeIndex,
      tags: entryTags,
      textMatched: !!textMatched,
      matchingTagCount,
      hasExplicitRelation,
    });
  }

  return filtered;
}

// FilterStageResult is imported from ../types.js

/**
 * Filter stage - applies all filters to fetched entries
 *
 * Populates ctx.filtered with the filtered entries for the score stage.
 */
export function filterStage(ctx: PipelineContext): PipelineContext {
  const { fetchedEntries, types } = ctx;

  const filtered: FilterStageResult = {
    tools: [],
    guidelines: [],
    knowledge: [],
  };

  if (types.includes('tools')) {
    filtered.tools = filterEntriesOfType(fetchedEntries.tools, 'tools', 'tool', ctx);
  }
  if (types.includes('guidelines')) {
    filtered.guidelines = filterEntriesOfType(
      fetchedEntries.guidelines,
      'guidelines',
      'guideline',
      ctx
    );
  }
  if (types.includes('knowledge')) {
    filtered.knowledge = filterEntriesOfType(
      fetchedEntries.knowledge,
      'knowledge',
      'knowledge',
      ctx
    );
  }

  return {
    ...ctx,
    filtered,
  };
}
