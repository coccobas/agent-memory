/**
 * Entity Filter Stage
 *
 * Pipeline stage for entity-aware retrieval.
 * Extracts entities from the search query and filters/boosts entries that match.
 *
 * Algorithm:
 * 1. Extract entities from the search query (file paths, function names, etc.)
 * 2. If entities found, look up matching entry IDs from the entity index
 * 3. Store matched IDs in context for use by filter/score stages
 * 4. If no entity matches, fall back to pure semantic search
 *
 * Entity match provides a score boost in the scoring stage.
 */

import type { PipelineContext } from '../pipeline.js';
import { getEntityExtractor, type ExtractedEntity } from '../entity-extractor.js';
import type { EntityIndex } from '../entity-index.js';

/**
 * Entity filter stage configuration
 */
export interface EntityFilterConfig {
  /** Whether entity filtering is enabled */
  enabled: boolean;
  /** Score boost for exact entity match */
  exactMatchBoost: number;
  /** Score boost for partial entity match (multiple entities, some match) */
  partialMatchBoost: number;
  /** Minimum entities to require for filtering (0 = filter on any match) */
  minEntitiesForFilter: number;
}

/**
 * Default entity filter configuration
 */
export const DEFAULT_ENTITY_FILTER_CONFIG: EntityFilterConfig = {
  enabled: true,
  exactMatchBoost: 25,
  partialMatchBoost: 10,
  minEntitiesForFilter: 0,
};

/**
 * Entity filter stage result stored in context
 */
export interface EntityFilterResult {
  /** Entities extracted from the search query */
  extractedEntities: ExtractedEntity[];
  /** Entry IDs that match at least one entity */
  matchedEntryIds: Set<string>;
  /** Map from entry ID to number of matched entities */
  matchCountByEntry: Map<string, number>;
  /** Total number of entities extracted */
  entityCount: number;
  /** Whether entity filtering was applied */
  filterApplied: boolean;
}

/**
 * Extended pipeline context with entity filter result
 */
export interface EntityFilterPipelineContext extends PipelineContext {
  entityFilter?: EntityFilterResult;
}

/**
 * Create the entity filter stage
 *
 * @param entityIndex - The entity index service for lookups
 * @param config - Configuration options
 * @returns Pipeline stage function
 */
export function createEntityFilterStage(
  entityIndex: EntityIndex,
  config: EntityFilterConfig = DEFAULT_ENTITY_FILTER_CONFIG
): (ctx: PipelineContext) => PipelineContext {
  return function entityFilterStage(ctx: PipelineContext): PipelineContext {
    const { search } = ctx;

    // Skip if entity filtering is disabled or no search query
    if (!config.enabled || !search) {
      return ctx;
    }

    const extractor = getEntityExtractor();
    const extractedEntities = extractor.extract(search);

    // If no entities extracted, skip filtering
    if (extractedEntities.length === 0) {
      return ctx;
    }

    // Check minimum entity threshold
    if (extractedEntities.length < config.minEntitiesForFilter) {
      return ctx;
    }

    // Look up matching entry IDs
    const matchCountByEntry = entityIndex.lookupMultiple(extractedEntities);

    // Build the matched entry IDs set
    const matchedEntryIds = new Set<string>(matchCountByEntry.keys());

    // Create the entity filter result
    const entityFilter: EntityFilterResult = {
      extractedEntities,
      matchedEntryIds,
      matchCountByEntry,
      entityCount: extractedEntities.length,
      filterApplied: matchedEntryIds.size > 0,
    };

    return {
      ...ctx,
      entityFilter,
    } as EntityFilterPipelineContext;
  };
}

/**
 * Get entity match score boost for an entry
 *
 * @param entryId - The entry ID to check
 * @param ctx - Pipeline context with entity filter result
 * @param config - Configuration options
 * @returns Score boost to apply (0 if no match)
 */
export function getEntityMatchBoost(
  entryId: string,
  ctx: EntityFilterPipelineContext,
  config: EntityFilterConfig = DEFAULT_ENTITY_FILTER_CONFIG
): number {
  const { entityFilter } = ctx;

  // No entity filter result or no matches
  if (!entityFilter?.filterApplied) {
    return 0;
  }

  const matchCount = entityFilter.matchCountByEntry.get(entryId);

  if (!matchCount || matchCount === 0) {
    return 0;
  }

  // Full match (all extracted entities matched)
  if (matchCount >= entityFilter.entityCount) {
    return config.exactMatchBoost;
  }

  // Partial match - scale boost by match ratio
  const matchRatio = matchCount / entityFilter.entityCount;
  return Math.round(config.partialMatchBoost * matchRatio);
}

/**
 * Check if an entry matches any extracted entities
 *
 * @param entryId - The entry ID to check
 * @param ctx - Pipeline context with entity filter result
 * @returns True if the entry matches at least one entity
 */
export function hasEntityMatch(entryId: string, ctx: EntityFilterPipelineContext): boolean {
  return ctx.entityFilter?.matchedEntryIds.has(entryId) ?? false;
}

/**
 * Filter entry IDs to only those matching entities
 *
 * @param entryIds - Entry IDs to filter
 * @param ctx - Pipeline context with entity filter result
 * @returns Filtered entry IDs (or original if no entity filter applied)
 */
export function filterByEntityMatch(
  entryIds: string[],
  ctx: EntityFilterPipelineContext
): string[] {
  const { entityFilter } = ctx;

  // If no entity filter or no matches, return all entries (fallback to semantic)
  if (!entityFilter?.filterApplied) {
    return entryIds;
  }

  // Filter to only matching entries
  return entryIds.filter((id) => entityFilter.matchedEntryIds.has(id));
}

/**
 * Get entity filter statistics for debugging/logging
 *
 * @param ctx - Pipeline context with entity filter result
 * @returns Statistics object or null if no entity filter applied
 */
export function getEntityFilterStats(ctx: EntityFilterPipelineContext): {
  entityCount: number;
  matchedEntryCount: number;
  filterApplied: boolean;
  entityTypes: string[];
} | null {
  const { entityFilter } = ctx;

  if (!entityFilter) {
    return null;
  }

  const entityTypes = [...new Set(entityFilter.extractedEntities.map((e) => e.type))];

  return {
    entityCount: entityFilter.entityCount,
    matchedEntryCount: entityFilter.matchedEntryIds.size,
    filterApplied: entityFilter.filterApplied,
    entityTypes,
  };
}
