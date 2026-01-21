/**
 * Priority Integration Service
 *
 * Bridges SmartPrioritizationService to context injection pipeline.
 * Fetches priority scores and re-ranks entries for optimal selection.
 */

import { createComponentLogger } from '../../utils/logger.js';
import type {
  SmartPrioritizationService,
  PriorityEntry,
} from '../prioritization/smart-prioritization.service.js';
import type { SmartPriorityResult } from '../prioritization/types.js';
import type { QueryIntent } from '../query-rewrite/types.js';

const logger = createComponentLogger('priority-integration');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Entry for priority-based selection
 */
export interface PrioritizableEntry {
  id: string;
  type: 'guideline' | 'knowledge' | 'tool' | 'experience';
  title?: string;
  content?: string;
  priority?: number;
  relevanceScore?: number;
}

/**
 * Entry with priority score attached
 */
export interface PrioritizedEntry extends PrioritizableEntry {
  /** Smart priority score result */
  priorityResult?: SmartPriorityResult;
  /** Composite score for sorting */
  compositePriorityScore: number;
}

/**
 * Configuration for priority integration
 */
export interface PriorityIntegrationConfig {
  /** Enable priority-based injection */
  enabled: boolean;
  /** Minimum priority score to include (0-1) */
  minScore: number;
  /** Weight for smart priority vs relevance */
  smartPriorityWeight: number;
  /** Overfetch multiplier for better selection */
  overfetchMultiplier: number;
}

/**
 * Default priority integration configuration
 */
export const DEFAULT_PRIORITY_INTEGRATION_CONFIG: PriorityIntegrationConfig = {
  enabled: true,
  minScore: 0.3,
  smartPriorityWeight: 0.6,
  overfetchMultiplier: 2.0,
};

/**
 * Priority integration result
 */
export interface PriorityIntegrationResult {
  /** Prioritized entries sorted by score */
  entries: PrioritizedEntry[];
  /** Entries excluded due to low score */
  excluded: PrioritizableEntry[];
  /** Statistics */
  stats: {
    totalInput: number;
    totalPrioritized: number;
    totalExcluded: number;
    avgPriorityScore: number;
    processingTimeMs: number;
  };
}

// =============================================================================
// PRIORITY INTEGRATION SERVICE
// =============================================================================

/**
 * PriorityIntegrationService bridges smart prioritization to context injection.
 *
 * Flow:
 * 1. Receive candidate entries from retrieval
 * 2. Fetch smart priority scores from SmartPrioritizationService
 * 3. Combine with relevance scores
 * 4. Filter by minimum score threshold
 * 5. Sort by composite score for optimal selection
 */
export class PriorityIntegrationService {
  constructor(
    private readonly prioritizationService: SmartPrioritizationService | null,
    private readonly config: PriorityIntegrationConfig = DEFAULT_PRIORITY_INTEGRATION_CONFIG
  ) {}

  /**
   * Prioritize entries for injection
   *
   * @param entries - Candidate entries
   * @param intent - Query intent
   * @param queryEmbedding - Query embedding for context similarity
   * @param scopeId - Scope ID for adaptive weights
   * @returns Prioritized and sorted entries
   */
  async prioritize(
    entries: PrioritizableEntry[],
    intent?: QueryIntent,
    queryEmbedding?: number[],
    scopeId?: string
  ): Promise<PriorityIntegrationResult> {
    const startTime = Date.now();

    // Return unchanged if disabled or no service
    if (!this.config.enabled || !this.prioritizationService) {
      return this.createPassthroughResult(entries, startTime);
    }

    // Convert to priority entry format
    const priorityEntries: PriorityEntry[] = entries.map((e) => ({
      id: e.id,
      type: e.type,
    }));

    // Get smart priority scores
    let priorityScores: Map<string, SmartPriorityResult>;
    try {
      priorityScores = await this.prioritizationService.getPriorityScores(
        priorityEntries,
        intent ?? 'explore',
        queryEmbedding,
        scopeId
      );
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to get priority scores, using fallback'
      );
      return this.createPassthroughResult(entries, startTime);
    }

    // Combine scores and create prioritized entries
    const prioritizedEntries: PrioritizedEntry[] = [];
    const excludedEntries: PrioritizableEntry[] = [];

    for (const entry of entries) {
      const priorityResult = priorityScores.get(entry.id);
      const compositeScore = this.calculateCompositeScore(entry, priorityResult);

      if (compositeScore >= this.config.minScore) {
        prioritizedEntries.push({
          ...entry,
          priorityResult,
          compositePriorityScore: compositeScore,
        });
      } else {
        excludedEntries.push(entry);
      }
    }

    // Sort by composite score (descending)
    prioritizedEntries.sort((a, b) => b.compositePriorityScore - a.compositePriorityScore);

    const avgScore =
      prioritizedEntries.length > 0
        ? prioritizedEntries.reduce((sum, e) => sum + e.compositePriorityScore, 0) /
          prioritizedEntries.length
        : 0;

    const processingTimeMs = Date.now() - startTime;

    logger.debug(
      {
        totalInput: entries.length,
        totalPrioritized: prioritizedEntries.length,
        totalExcluded: excludedEntries.length,
        avgScore: avgScore.toFixed(3),
        processingTimeMs,
      },
      'Priority integration complete'
    );

    return {
      entries: prioritizedEntries,
      excluded: excludedEntries,
      stats: {
        totalInput: entries.length,
        totalPrioritized: prioritizedEntries.length,
        totalExcluded: excludedEntries.length,
        avgPriorityScore: avgScore,
        processingTimeMs,
      },
    };
  }

  /**
   * Get top N entries by priority
   *
   * @param entries - Candidate entries
   * @param limit - Maximum entries to return
   * @param intent - Query intent
   * @param queryEmbedding - Query embedding
   * @param scopeId - Scope ID
   * @returns Top prioritized entries
   */
  async getTopPrioritized(
    entries: PrioritizableEntry[],
    limit: number,
    intent?: QueryIntent,
    queryEmbedding?: number[],
    scopeId?: string
  ): Promise<PrioritizedEntry[]> {
    const result = await this.prioritize(entries, intent, queryEmbedding, scopeId);
    return result.entries.slice(0, limit);
  }

  /**
   * Calculate recommended overfetch count
   *
   * When retrieving entries, fetch this many to have good selection choices.
   *
   * @param desiredCount - Desired final count
   * @returns Recommended fetch count
   */
  getOverfetchCount(desiredCount: number): number {
    if (!this.config.enabled) {
      return desiredCount;
    }
    return Math.ceil(desiredCount * this.config.overfetchMultiplier);
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<PriorityIntegrationConfig> {
    return { ...this.config };
  }

  /**
   * Calculate composite priority score
   *
   * Combines smart priority with relevance score
   */
  private calculateCompositeScore(
    entry: PrioritizableEntry,
    priorityResult?: SmartPriorityResult
  ): number {
    // Use smart priority if available
    const smartScore = priorityResult?.compositePriorityScore ?? 0.5;

    // Use relevance score if available
    const relevanceScore = entry.relevanceScore ?? 0.5;

    // Use explicit priority if available (normalize 1-10 to 0-1)
    const explicitPriority = entry.priority !== undefined ? entry.priority / 10 : 0.5;

    // Combine: smart priority weight vs relevance
    const smartWeight = this.config.smartPriorityWeight;
    const relevanceWeight = 1 - smartWeight;

    // Base composite from smart priority and relevance
    const baseComposite = smartScore * smartWeight + relevanceScore * relevanceWeight;

    // Boost by explicit priority (up to 20% boost)
    const priorityBoost = 1 + (explicitPriority - 0.5) * 0.4;

    return Math.min(1.0, baseComposite * priorityBoost);
  }

  /**
   * Create passthrough result when prioritization is disabled
   */
  private createPassthroughResult(
    entries: PrioritizableEntry[],
    startTime: number
  ): PriorityIntegrationResult {
    const prioritizedEntries: PrioritizedEntry[] = entries.map((e) => ({
      ...e,
      compositePriorityScore: e.relevanceScore ?? 0.5,
    }));

    // Sort by relevance score in passthrough mode
    prioritizedEntries.sort((a, b) => b.compositePriorityScore - a.compositePriorityScore);

    return {
      entries: prioritizedEntries,
      excluded: [],
      stats: {
        totalInput: entries.length,
        totalPrioritized: entries.length,
        totalExcluded: 0,
        avgPriorityScore:
          entries.length > 0
            ? entries.reduce((sum, e) => sum + (e.relevanceScore ?? 0.5), 0) / entries.length
            : 0,
        processingTimeMs: Date.now() - startTime,
      },
    };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a PriorityIntegrationService
 *
 * @param prioritizationService - SmartPrioritizationService instance (optional)
 * @param config - Configuration options
 * @returns Configured PriorityIntegrationService
 */
export function createPriorityIntegrationService(
  prioritizationService: SmartPrioritizationService | null,
  config?: Partial<PriorityIntegrationConfig>
): PriorityIntegrationService {
  const mergedConfig: PriorityIntegrationConfig = {
    ...DEFAULT_PRIORITY_INTEGRATION_CONFIG,
    ...config,
  };

  return new PriorityIntegrationService(prioritizationService, mergedConfig);
}
