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
 */

import type { PipelineContext, QueryType, QueryEntryType } from '../pipeline.js';
import type { Tool, Guideline, Knowledge, Tag } from '../../../db/schema.js';
import { filterByTags } from './tags.js';
import { getPreparedStatement } from '../../../db/connection.js';
import { executeFts5Query } from '../../query.service.js';

// Note: We don't need getDb here as getPreparedStatement handles DB access internally

type EntryUnion = Tool | Guideline | Knowledge;

interface DedupedEntry<T> {
  entry: T;
  scopeIndex: number;
}

/**
 * Get the name/title field for deduplication key
 */
function getEntryKeyName(entry: EntryUnion, type: QueryType): string {
  if (type === 'knowledge') {
    return (entry as Knowledge).title;
  }
  return (entry as Tool | Guideline).name;
}

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
    const keyName = getEntryKeyName(entry, type);
    const key = `${entry.scopeType}:${entry.scopeId ?? ''}:${keyName}`;
    const existing = dedupMap.get(key);
    if (!existing || item.scopeIndex < existing.scopeIndex) {
      dedupMap.set(key, item);
    }
  }

  return Array.from(dedupMap.values());
}

/**
 * Text matching functions
 */
function textMatches(text: string | null | undefined, search: string): boolean {
  if (!text) return false;
  return text.toLowerCase().includes(search.toLowerCase());
}

function fuzzyTextMatches(text: string | null | undefined, search: string): boolean {
  if (!text) return false;
  const textLower = text.toLowerCase();
  const searchLower = search.toLowerCase();

  // Simple Levenshtein-based fuzzy: allow 1 edit per 4 chars
  const maxDist = Math.floor(search.length / 4) + 1;

  // Check if any substring of text is within edit distance
  for (let i = 0; i <= textLower.length - searchLower.length + maxDist; i++) {
    const substr = textLower.substring(i, i + searchLower.length + maxDist);
    if (levenshteinDistance(substr, searchLower) <= maxDist) {
      return true;
    }
  }
  return false;
}

function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1,
          matrix[i]![j - 1]! + 1,
          matrix[i - 1]![j]! + 1
        );
      }
    }
  }
  return matrix[b.length]![a.length]!;
}

function regexTextMatches(text: string | null | undefined, pattern: string): boolean {
  if (!text) return false;
  try {
    const regex = new RegExp(pattern, 'i');
    return regex.test(text);
  } catch {
    return false;
  }
}

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

/**
 * Type guards
 */
function isTool(entry: EntryUnion): entry is Tool {
  return 'name' in entry && !('priority' in entry) && !('title' in entry);
}

function isGuideline(entry: EntryUnion): entry is Guideline {
  return 'priority' in entry;
}

function isKnowledge(entry: EntryUnion): entry is Knowledge {
  return 'title' in entry;
}

export interface FilteredEntry<T extends EntryUnion> {
  entry: T;
  scopeIndex: number;
  tags: Tag[];
  textMatched: boolean;
  matchingTagCount: number;
  hasExplicitRelation: boolean;
}

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

  // Get FTS5 matching rowids for text search
  const useFts5 = params.useFts5 === true && search;
  let fts5MatchingRowids: Set<number> | null = null;
  let rowidMap: Map<string, number> | null = null;

  if (useFts5) {
    fts5MatchingRowids = executeFts5Query(entryType, search, params.fields);

    if (fts5MatchingRowids && fts5MatchingRowids.size > 0 && entryIds.length > 0) {
      const tableName =
        type === 'tools' ? 'tools' : type === 'guidelines' ? 'guidelines' : 'knowledge';
      const placeholders = entryIds.map(() => '?').join(',');
      const batchRowidQuery = getPreparedStatement(
        `SELECT id, rowid FROM ${tableName} WHERE id IN (${placeholders})`
      );
      const rowidResults = batchRowidQuery.all(...entryIds) as Array<{ id: string; rowid: number }>;
      rowidMap = new Map(rowidResults.map((r) => [r.id, r.rowid]));
    }
  }

  const matchFunc = params.regex
    ? regexTextMatches
    : params.fuzzy
      ? fuzzyTextMatches
      : textMatches;

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
    if (type === 'guidelines' && params.priority && isGuideline(entry)) {
      if (!priorityInRange(entry.priority, params.priority.min, params.priority.max)) {
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
        // Regular text matching
        if (isTool(entry)) {
          textMatched = matchFunc(entry.name, search);
        } else if (isGuideline(entry)) {
          textMatched = matchFunc(entry.name, search);
        } else if (isKnowledge(entry)) {
          textMatched = matchFunc(entry.title, search);
        }
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

export interface FilterStageResult {
  tools: FilteredEntry<Tool>[];
  guidelines: FilteredEntry<Guideline>[];
  knowledge: FilteredEntry<Knowledge>[];
}

/**
 * Filter stage - applies all filters to fetched entries
 */
export function filterStage(ctx: PipelineContext): PipelineContext & { filtered: FilterStageResult } {
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
    filtered.guidelines = filterEntriesOfType(fetchedEntries.guidelines, 'guidelines', 'guideline', ctx);
  }
  if (types.includes('knowledge')) {
    filtered.knowledge = filterEntriesOfType(fetchedEntries.knowledge, 'knowledge', 'knowledge', ctx);
  }

  return {
    ...ctx,
    filtered,
  };
}
