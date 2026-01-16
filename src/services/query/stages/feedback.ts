/**
 * Feedback Stage
 *
 * Pre-loads feedback scores for filtered entries before the score stage.
 * This enables efficient batch loading of feedback data from the database.
 *
 * Pipeline Position: After filter stage, before score stage
 *
 * Features:
 * - Batch loading of feedback scores
 * - LRU cache integration for repeated queries
 * - Configurable enable/disable via config
 */

import type { PipelineContext, QueryEntryType } from '../pipeline.js';
import { config } from '../../../config/index.js';
import { getFeedbackScoreCache, type FeedbackScoreCache } from '../feedback-cache.js';
import type { EntryFeedbackScore } from '../../feedback/repositories/retrieval.repository.js';

/**
 * Extended pipeline context with feedback scores.
 * The score stage checks for this to apply feedback multipliers.
 */
export interface FeedbackPipelineContext extends PipelineContext {
  feedbackScores?: Map<string, EntryFeedbackScore>;
}

/**
 * Feedback stage - pre-loads feedback scores for filtered entries
 *
 * This stage must run after the filter stage (requires ctx.filtered).
 * Populates ctx.feedbackScores for use by the score stage.
 *
 * Skipped if:
 * - Feedback scoring is disabled in config
 * - No filtered entries
 * - Database access fails (graceful degradation)
 */
export function feedbackStage(ctx: PipelineContext): PipelineContext {
  const feedbackConfig = config.scoring.feedbackScoring;

  // Skip if feedback scoring is disabled
  if (!feedbackConfig.enabled) {
    return ctx;
  }

  // Skip if no filtered entries
  const filtered = ctx.filtered;
  if (!filtered) {
    return ctx;
  }

  // Collect all entry IDs by type
  const entries: Array<{ entryType: QueryEntryType; entryId: string }> = [];

  for (const item of filtered.tools) {
    entries.push({ entryType: 'tool', entryId: item.entry.id });
  }
  for (const item of filtered.guidelines) {
    entries.push({ entryType: 'guideline', entryId: item.entry.id });
  }
  for (const item of filtered.knowledge) {
    entries.push({ entryType: 'knowledge', entryId: item.entry.id });
  }
  for (const item of filtered.experiences) {
    entries.push({ entryType: 'experience', entryId: item.entry.id });
  }

  // Skip if no entries to load
  if (entries.length === 0) {
    return ctx;
  }

  // Get the feedback cache
  const cache = getFeedbackScoreCache();

  // Load feedback scores synchronously from cache
  // Note: Cache is pre-warmed or uses defaults for uncached entries
  const feedbackScores = loadFeedbackScoresSync(cache, entries);

  return {
    ...ctx,
    feedbackScores,
  } as FeedbackPipelineContext;
}

/**
 * Async feedback stage for future use when pipeline supports async stages
 *
 * This version performs actual database lookups for uncached entries.
 */
export async function feedbackStageAsync(ctx: PipelineContext): Promise<PipelineContext> {
  const feedbackConfig = config.scoring.feedbackScoring;

  // Skip if feedback scoring is disabled
  if (!feedbackConfig.enabled) {
    return ctx;
  }

  // Skip if no filtered entries
  const filtered = ctx.filtered;
  if (!filtered) {
    return ctx;
  }

  // Collect all entry IDs by type
  const entries: Array<{ entryType: QueryEntryType; entryId: string }> = [];

  for (const item of filtered.tools) {
    entries.push({ entryType: 'tool', entryId: item.entry.id });
  }
  for (const item of filtered.guidelines) {
    entries.push({ entryType: 'guideline', entryId: item.entry.id });
  }
  for (const item of filtered.knowledge) {
    entries.push({ entryType: 'knowledge', entryId: item.entry.id });
  }
  for (const item of filtered.experiences) {
    entries.push({ entryType: 'experience', entryId: item.entry.id });
  }

  // Skip if no entries to load
  if (entries.length === 0) {
    return ctx;
  }

  try {
    // Get the feedback cache and database
    const cache = getFeedbackScoreCache();
    const db = ctx.deps.getDb();

    // Load feedback scores with database fallback for uncached
    const feedbackScores = await cache.loadBatch(db, entries);

    return {
      ...ctx,
      feedbackScores,
    } as FeedbackPipelineContext;
  } catch {
    // Graceful degradation - return context without feedback scores
    // The score stage will work without them (no multiplier applied)
    return ctx;
  }
}

/**
 * Load feedback scores synchronously from cache only
 *
 * Returns cached values or default scores (0) for uncached entries.
 * This is used in the synchronous pipeline execution.
 */
function loadFeedbackScoresSync(
  cache: FeedbackScoreCache,
  entries: Array<{ entryType: QueryEntryType; entryId: string }>
): Map<string, EntryFeedbackScore> {
  const result = new Map<string, EntryFeedbackScore>();

  for (const entry of entries) {
    const cached = cache.get(entry.entryType, entry.entryId);
    if (cached) {
      result.set(entry.entryId, cached);
    } else {
      // Default score for uncached entries
      result.set(entry.entryId, {
        positiveCount: 0,
        negativeCount: 0,
        netScore: 0,
      });
    }
  }

  return result;
}

/**
 * Pre-warm the feedback cache for expected entries
 *
 * Call this before query execution if you know which entries will be queried.
 * This enables fully synchronous pipeline execution with feedback data.
 *
 * @param db - Database connection
 * @param entries - Entries to pre-warm cache for
 */
export async function prewarmFeedbackCache(
  db: ReturnType<PipelineContext['deps']['getDb']>,
  entries: Array<{ entryType: QueryEntryType; entryId: string }>
): Promise<void> {
  const cache = getFeedbackScoreCache();
  await cache.loadBatch(db, entries);
}
