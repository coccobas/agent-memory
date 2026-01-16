/**
 * Feedback Score Cache
 *
 * LRU cache for feedback scores to avoid repeated database queries
 * during scoring. Provides efficient batch loading and cache invalidation.
 */

import { LRUCache } from '../../utils/lru-cache.js';
import type { DrizzleDb } from '../../db/repositories/base.js';
import {
  getEntryFeedbackBatch,
  type EntryFeedbackScore,
} from '../feedback/repositories/retrieval.repository.js';
import type { QueryEntryType } from './types.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Feedback score with entry type for cache key generation
 */
export interface FeedbackCacheEntry extends EntryFeedbackScore {
  entryType: QueryEntryType;
  entryId: string;
  cachedAt: number;
}

/**
 * Configuration for the feedback score cache
 */
export interface FeedbackCacheConfig {
  /** Maximum number of entries to cache */
  maxSize: number;
  /** TTL in milliseconds for cached entries */
  ttlMs: number;
  /** Whether feedback scoring is enabled */
  enabled: boolean;
}

// =============================================================================
// FEEDBACK SCORE CACHE
// =============================================================================

/**
 * LRU cache for feedback scores.
 *
 * Features:
 * - Batch loading for efficiency
 * - TTL-based expiration
 * - Cache invalidation on new feedback
 */
export class FeedbackScoreCache {
  private cache: LRUCache<FeedbackCacheEntry>;
  private config: FeedbackCacheConfig;

  constructor(cacheConfig?: Partial<FeedbackCacheConfig>) {
    this.config = {
      maxSize: cacheConfig?.maxSize ?? 1000,
      ttlMs: cacheConfig?.ttlMs ?? 60000, // 1 minute default
      enabled: cacheConfig?.enabled ?? true,
    };

    // Task 34: Pass TTL to LRUCache for consistent expiration behavior
    // Previously, LRUCache didn't know about TTL, so expired entries could
    // remain in cache (though isValid() would reject them). Now both are synced.
    this.cache = new LRUCache<FeedbackCacheEntry>({
      maxSize: this.config.maxSize,
      ttlMs: this.config.ttlMs,
    });
  }

  /**
   * Generate cache key for an entry
   */
  private getCacheKey(entryType: QueryEntryType, entryId: string): string {
    return `${entryType}:${entryId}`;
  }

  // Bug #18 fix: Removed redundant isValid() method.
  // TTL is now handled by LRUCache (see Task 34 in constructor).
  // Double TTL checking caused a race condition where entries could pass
  // LRUCache's check but fail the separate isValid() check due to time drift.

  /**
   * Get feedback score for a single entry.
   * Returns cached value if available, otherwise returns null.
   * TTL expiration is handled by LRUCache.
   */
  get(entryType: QueryEntryType, entryId: string): EntryFeedbackScore | null {
    if (!this.config.enabled) {
      return null;
    }

    const key = this.getCacheKey(entryType, entryId);
    // Bug #18 fix: LRUCache handles TTL expiration automatically
    const cached = this.cache.get(key);

    if (cached) {
      return {
        positiveCount: cached.positiveCount,
        negativeCount: cached.negativeCount,
        netScore: cached.netScore,
      };
    }

    return null;
  }

  /**
   * Set feedback score for a single entry in cache
   */
  set(entryType: QueryEntryType, entryId: string, score: EntryFeedbackScore): void {
    if (!this.config.enabled) {
      return;
    }

    const key = this.getCacheKey(entryType, entryId);
    this.cache.set(key, {
      ...score,
      entryType,
      entryId,
      cachedAt: Date.now(),
    });
  }

  /**
   * Invalidate cache entry for a specific entry
   */
  invalidate(entryType: QueryEntryType, entryId: string): void {
    const key = this.getCacheKey(entryType, entryId);
    this.cache.delete(key);
  }

  /**
   * Invalidate all cache entries (e.g., after bulk feedback update)
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Load feedback scores for multiple entries in batch.
   * Efficiently fetches missing scores from database.
   *
   * @param db - Database connection
   * @param entries - Array of entries to load scores for
   * @returns Map of entry ID to feedback score
   */
  async loadBatch(
    db: DrizzleDb,
    entries: Array<{ entryType: QueryEntryType; entryId: string }>
  ): Promise<Map<string, EntryFeedbackScore>> {
    const result = new Map<string, EntryFeedbackScore>();

    if (!this.config.enabled || entries.length === 0) {
      // Return empty scores for all entries
      for (const entry of entries) {
        result.set(entry.entryId, { positiveCount: 0, negativeCount: 0, netScore: 0 });
      }
      return result;
    }

    // Separate entries into cached and uncached
    const uncached: Array<{ entryType: QueryEntryType; entryId: string }> = [];

    for (const entry of entries) {
      const cached = this.get(entry.entryType, entry.entryId);
      if (cached) {
        result.set(entry.entryId, cached);
      } else {
        uncached.push(entry);
      }
    }

    // Fetch uncached entries from database
    if (uncached.length > 0) {
      // Convert QueryEntryType to the format expected by getEntryFeedbackBatch
      const dbEntries = uncached.map((e) => ({
        entryType: e.entryType as 'tool' | 'guideline' | 'knowledge' | 'experience',
        entryId: e.entryId,
      }));

      const fetched = await getEntryFeedbackBatch(db, dbEntries);

      // Cache and add to result
      for (const entry of uncached) {
        const score = fetched.get(entry.entryId) ?? {
          positiveCount: 0,
          negativeCount: 0,
          netScore: 0,
        };

        this.set(entry.entryType, entry.entryId, score);
        result.set(entry.entryId, score);
      }
    }

    return result;
  }

  /**
   * Get cache statistics for monitoring
   */
  getStats(): { size: number; maxSize: number; enabled: boolean } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      enabled: this.config.enabled,
    };
  }
}

// =============================================================================
// FEEDBACK MULTIPLIER CALCULATION
// =============================================================================

/**
 * Configuration for feedback multiplier calculation.
 * Loaded from config.scoring.feedbackScoring.
 */
export interface FeedbackScoringConfig {
  /** Whether feedback scoring is enabled */
  enabled: boolean;
  /** Boost per positive feedback (e.g., 0.02 = +2%) */
  boostPerPositive: number;
  /** Maximum boost from positive feedback (e.g., 0.10 = +10%) */
  boostMax: number;
  /** Penalty per negative feedback (e.g., 0.10 = -10%) */
  penaltyPerNegative: number;
  /** Maximum penalty from negative feedback (e.g., 0.50 = -50%) */
  penaltyMax: number;
}

/**
 * Default feedback scoring configuration.
 * These values match the requirements in domination.md Task 1.3.
 */
export const DEFAULT_FEEDBACK_SCORING_CONFIG: FeedbackScoringConfig = {
  enabled: true,
  boostPerPositive: 0.02, // +2% per positive
  boostMax: 0.1, // max +10%
  penaltyPerNegative: 0.1, // -10% per negative
  penaltyMax: 0.5, // max -50%
};

/**
 * Calculate the feedback multiplier for an entry.
 *
 * Positive feedback: +2% per positive, max +10%
 * Negative feedback: Graduated penalty (0.9, 0.8, 0.7, 0.6, 0.5 minimum)
 *
 * @param feedback - The feedback score for the entry
 * @param scoringConfig - Optional scoring configuration (uses defaults if not provided)
 * @returns Multiplier to apply to base score (e.g., 1.10 for +10%, 0.80 for -20%)
 */
export function getFeedbackMultiplier(
  feedback: EntryFeedbackScore,
  scoringConfig?: FeedbackScoringConfig
): number {
  const cfg = scoringConfig ?? DEFAULT_FEEDBACK_SCORING_CONFIG;

  if (!cfg.enabled) {
    return 1.0;
  }

  if (feedback.netScore > 0) {
    // Positive feedback: apply boost
    const boost = Math.min(feedback.positiveCount * cfg.boostPerPositive, cfg.boostMax);
    return 1.0 + boost;
  } else if (feedback.netScore < 0) {
    // Negative feedback: apply graduated penalty
    const penalty = Math.min(Math.abs(feedback.netScore) * cfg.penaltyPerNegative, cfg.penaltyMax);
    return 1.0 - penalty;
  }

  // Neutral (netScore === 0)
  return 1.0;
}

// =============================================================================
// SINGLETON MANAGEMENT
// =============================================================================

let cacheInstance: FeedbackScoreCache | null = null;

/**
 * Get or create the singleton feedback score cache
 * @deprecated Use context.services.feedbackScoreCache instead via dependency injection
 */
export function getFeedbackScoreCache(): FeedbackScoreCache {
  if (!cacheInstance) {
    cacheInstance = new FeedbackScoreCache({
      maxSize: 1000,
      ttlMs: 60000, // 1 minute
      enabled: true, // Will be checked against config at runtime
    });
  }
  return cacheInstance;
}

/**
 * Reset the feedback score cache (for testing)
 */
export function resetFeedbackScoreCache(): void {
  cacheInstance = null;
}
