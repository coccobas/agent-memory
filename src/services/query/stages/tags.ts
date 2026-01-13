/**
 * Tags Stage
 *
 * Loads tags for all fetched entries and builds the tagsByEntry map.
 * Also handles tag-based filtering.
 *
 * Uses injected dependencies for tag loading to support testing with mocks.
 */

import type { PipelineContext } from '../pipeline.js';
import type { Tag } from '../../../db/schema.js';

/**
 * Filter entries by tag constraints
 */
export function filterByTags(
  tagsByEntry: Record<string, Tag[]>,
  tagFilters: { include?: string[]; exclude?: string[]; require?: string[] }
): Set<string> {
  const allowed = new Set<string>();

  const includeSet = tagFilters.include
    ? new Set(tagFilters.include.map((t) => t.toLowerCase()))
    : null;
  const excludeSet = tagFilters.exclude
    ? new Set(tagFilters.exclude.map((t) => t.toLowerCase()))
    : null;
  const requireSet = tagFilters.require
    ? new Set(tagFilters.require.map((t) => t.toLowerCase()))
    : null;

  for (const [entryId, entryTags] of Object.entries(tagsByEntry)) {
    const tagNames = new Set(entryTags.map((t) => t.name.toLowerCase()));

    // Exclude check: if any excluded tag is present, skip
    if (excludeSet) {
      let hasExcluded = false;
      for (const ex of excludeSet) {
        if (tagNames.has(ex)) {
          hasExcluded = true;
          break;
        }
      }
      if (hasExcluded) continue;
    }

    // Require check: all required tags must be present
    if (requireSet) {
      let hasAllRequired = true;
      for (const req of requireSet) {
        if (!tagNames.has(req)) {
          hasAllRequired = false;
          break;
        }
      }
      if (!hasAllRequired) continue;
    }

    // Include check: at least one included tag must be present (if specified)
    if (includeSet && includeSet.size > 0) {
      let hasIncluded = false;
      for (const inc of includeSet) {
        if (tagNames.has(inc)) {
          hasIncluded = true;
          break;
        }
      }
      if (!hasIncluded) continue;
    }

    allowed.add(entryId);
  }

  return allowed;
}

/**
 * Tags stage - loads tags for all fetched entries
 *
 * Uses ctx.deps.getTagsForEntries() instead of calling the global function directly.
 * Task 28: Now uses batched version when available for better performance.
 *
 * This is used when tag filtering is required (before filter stage).
 */
export function tagsStage(ctx: PipelineContext): PipelineContext {
  const { fetchedEntries, deps } = ctx;

  // Collect all entry IDs by type
  const toolIds = fetchedEntries.tools.map((e) => e.entry.id);
  const guidelineIds = fetchedEntries.guidelines.map((e) => e.entry.id);
  const knowledgeIds = fetchedEntries.knowledge.map((e) => e.entry.id);
  const experienceIds = fetchedEntries.experiences.map((e) => e.entry.id);

  let tagsByEntry: Record<string, Tag[]>;

  // Task 28: Use batched version if available (single DB call for all types)
  if (deps.getTagsForEntriesBatch) {
    const entriesByType = new Map<'tool' | 'guideline' | 'knowledge' | 'experience', string[]>();
    if (toolIds.length > 0) entriesByType.set('tool', toolIds);
    if (guidelineIds.length > 0) entriesByType.set('guideline', guidelineIds);
    if (knowledgeIds.length > 0) entriesByType.set('knowledge', knowledgeIds);
    if (experienceIds.length > 0) entriesByType.set('experience', experienceIds);

    tagsByEntry = deps.getTagsForEntriesBatch(entriesByType);
  } else {
    // Fallback: batch load tags for each type separately
    tagsByEntry = {};
    if (toolIds.length > 0) {
      Object.assign(tagsByEntry, deps.getTagsForEntries('tool', toolIds));
    }
    if (guidelineIds.length > 0) {
      Object.assign(tagsByEntry, deps.getTagsForEntries('guideline', guidelineIds));
    }
    if (knowledgeIds.length > 0) {
      Object.assign(tagsByEntry, deps.getTagsForEntries('knowledge', knowledgeIds));
    }
    if (experienceIds.length > 0) {
      Object.assign(tagsByEntry, deps.getTagsForEntries('experience', experienceIds));
    }
  }

  return {
    ...ctx,
    tagsByEntry,
  };
}

/**
 * Post-filter tags stage - loads tags only for filtered entries
 *
 * This is a memory optimization that loads tags only for entries that passed filtering.
 * Task 28: Now uses batched version when available for better performance.
 * Used when tag filtering is NOT required (after filter stage).
 */
export function postFilterTagsStage(ctx: PipelineContext): PipelineContext {
  const { filtered, deps } = ctx;

  if (!filtered) {
    // No filtered entries, return context as-is
    return ctx;
  }

  // Collect entry IDs only from filtered entries
  const toolIds = filtered.tools.map((e) => e.entry.id);
  const guidelineIds = filtered.guidelines.map((e) => e.entry.id);
  const knowledgeIds = filtered.knowledge.map((e) => e.entry.id);
  const experienceIds = filtered.experiences.map((e) => e.entry.id);

  let tagsByEntry: Record<string, Tag[]>;

  // Task 28: Use batched version if available (single DB call for all types)
  if (deps.getTagsForEntriesBatch) {
    const entriesByType = new Map<'tool' | 'guideline' | 'knowledge' | 'experience', string[]>();
    if (toolIds.length > 0) entriesByType.set('tool', toolIds);
    if (guidelineIds.length > 0) entriesByType.set('guideline', guidelineIds);
    if (knowledgeIds.length > 0) entriesByType.set('knowledge', knowledgeIds);
    if (experienceIds.length > 0) entriesByType.set('experience', experienceIds);

    tagsByEntry = deps.getTagsForEntriesBatch(entriesByType);
  } else {
    // Fallback: batch load tags for each type separately
    tagsByEntry = {};
    if (toolIds.length > 0) {
      Object.assign(tagsByEntry, deps.getTagsForEntries('tool', toolIds));
    }
    if (guidelineIds.length > 0) {
      Object.assign(tagsByEntry, deps.getTagsForEntries('guideline', guidelineIds));
    }
    if (knowledgeIds.length > 0) {
      Object.assign(tagsByEntry, deps.getTagsForEntries('knowledge', knowledgeIds));
    }
    if (experienceIds.length > 0) {
      Object.assign(tagsByEntry, deps.getTagsForEntries('experience', experienceIds));
    }
  }

  return {
    ...ctx,
    tagsByEntry,
  };
}
