/**
 * Stale Context Detector
 *
 * Analyzes memory entries to detect potentially stale or outdated content.
 * Returns warnings that can be included in injection results.
 */

import { createComponentLogger } from '../../utils/logger.js';
import { calculateStalenessScore, type StalenessResult } from '../query/decay.js';

const logger = createComponentLogger('stale-detector');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Entry data needed for staleness analysis
 */
export interface StalenessEntry {
  id: string;
  type: 'guideline' | 'knowledge' | 'tool' | 'experience';
  title?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  accessedAt?: string | null;
}

/**
 * Staleness warning for a single entry
 */
export interface StalenessWarning {
  entryId: string;
  entryType: 'guideline' | 'knowledge' | 'tool' | 'experience';
  entryTitle?: string;
  reason: 'old_age' | 'low_recency' | 'not_accessed';
  ageDays?: number;
  recencyScore?: number;
  daysSinceAccess?: number;
  recommendation: string;
}

/**
 * Configuration for stale detection
 */
export interface StaleDetectorConfig {
  /** Enable staleness detection */
  enabled: boolean;
  /** Age in days to consider stale */
  staleAgeDays: number;
  /** Recency score threshold (0-1) */
  recencyThreshold: number;
  /** Days without access to flag */
  notAccessedDays: number;
  /** Decay half-life for recency calculation */
  decayHalfLifeDays: number;
  /** Exclude stale entries from injection results */
  excludeFromInjection: boolean;
}

/**
 * Default staleness detection config
 */
export const DEFAULT_STALE_DETECTOR_CONFIG: StaleDetectorConfig = {
  enabled: true,
  staleAgeDays: 90,
  recencyThreshold: 0.2,
  notAccessedDays: 60,
  decayHalfLifeDays: 14,
  excludeFromInjection: false,
};

/**
 * Staleness analysis result
 */
export interface StaleDetectorResult {
  /** Entries that passed (not stale or warnings only) */
  validEntries: StalenessEntry[];
  /** Stale entries (if excludeFromInjection) */
  excludedEntries: StalenessEntry[];
  /** Warnings for stale entries */
  warnings: StalenessWarning[];
  /** Processing statistics */
  stats: {
    totalAnalyzed: number;
    staleCount: number;
    excludedCount: number;
    processingTimeMs: number;
  };
}

// =============================================================================
// STALE DETECTOR SERVICE
// =============================================================================

/**
 * StaleContextDetector analyzes entries for potential staleness issues.
 *
 * Staleness is determined by:
 * - Age: entries older than configured threshold
 * - Recency score: entries with decayed importance below threshold
 * - Access patterns: entries not accessed recently
 */
export class StaleContextDetector {
  constructor(private readonly config: StaleDetectorConfig = DEFAULT_STALE_DETECTOR_CONFIG) {}

  /**
   * Analyze entries for staleness
   *
   * @param entries - Entries to analyze
   * @returns Analysis result with warnings and filtered entries
   */
  analyze(entries: StalenessEntry[]): StaleDetectorResult {
    const startTime = Date.now();

    // Skip if disabled
    if (!this.config.enabled) {
      return {
        validEntries: entries,
        excludedEntries: [],
        warnings: [],
        stats: {
          totalAnalyzed: entries.length,
          staleCount: 0,
          excludedCount: 0,
          processingTimeMs: 0,
        },
      };
    }

    const validEntries: StalenessEntry[] = [];
    const excludedEntries: StalenessEntry[] = [];
    const warnings: StalenessWarning[] = [];

    for (const entry of entries) {
      const stalenessResult = calculateStalenessScore({
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        accessedAt: entry.accessedAt,
        staleAgeDays: this.config.staleAgeDays,
        recencyThreshold: this.config.recencyThreshold,
        notAccessedDays: this.config.notAccessedDays,
        decayHalfLifeDays: this.config.decayHalfLifeDays,
      });

      if (stalenessResult.isStale) {
        const warning = this.createWarning(entry, stalenessResult);
        warnings.push(warning);

        if (this.config.excludeFromInjection) {
          excludedEntries.push(entry);
        } else {
          validEntries.push(entry);
        }
      } else {
        validEntries.push(entry);
      }
    }

    const processingTimeMs = Date.now() - startTime;

    logger.debug(
      {
        totalAnalyzed: entries.length,
        staleCount: warnings.length,
        excludedCount: excludedEntries.length,
        processingTimeMs,
      },
      'Staleness analysis complete'
    );

    return {
      validEntries,
      excludedEntries,
      warnings,
      stats: {
        totalAnalyzed: entries.length,
        staleCount: warnings.length,
        excludedCount: excludedEntries.length,
        processingTimeMs,
      },
    };
  }

  /**
   * Analyze a single entry
   *
   * @param entry - Entry to analyze
   * @returns Warning if stale, null otherwise
   */
  analyzeEntry(entry: StalenessEntry): StalenessWarning | null {
    if (!this.config.enabled) {
      return null;
    }

    const stalenessResult = calculateStalenessScore({
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      accessedAt: entry.accessedAt,
      staleAgeDays: this.config.staleAgeDays,
      recencyThreshold: this.config.recencyThreshold,
      notAccessedDays: this.config.notAccessedDays,
      decayHalfLifeDays: this.config.decayHalfLifeDays,
    });

    if (stalenessResult.isStale) {
      return this.createWarning(entry, stalenessResult);
    }

    return null;
  }

  /**
   * Check if an entry would be excluded from injection
   */
  shouldExclude(entry: StalenessEntry): boolean {
    if (!this.config.enabled || !this.config.excludeFromInjection) {
      return false;
    }

    const stalenessResult = calculateStalenessScore({
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      accessedAt: entry.accessedAt,
      staleAgeDays: this.config.staleAgeDays,
      recencyThreshold: this.config.recencyThreshold,
      notAccessedDays: this.config.notAccessedDays,
      decayHalfLifeDays: this.config.decayHalfLifeDays,
    });

    return stalenessResult.isStale;
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<StaleDetectorConfig> {
    return { ...this.config };
  }

  /**
   * Create a staleness warning from analysis result
   */
  private createWarning(entry: StalenessEntry, result: StalenessResult): StalenessWarning {
    const recommendation = this.generateRecommendation(result, entry.type);

    return {
      entryId: entry.id,
      entryType: entry.type,
      entryTitle: entry.title,
      reason: result.reason ?? 'old_age',
      ageDays: result.ageDays,
      recencyScore: result.recencyScore,
      daysSinceAccess: result.daysSinceAccess,
      recommendation,
    };
  }

  /**
   * Generate a user-friendly recommendation based on staleness reason
   */
  private generateRecommendation(
    result: StalenessResult,
    entryType: StalenessEntry['type']
  ): string {
    const typeLabel = entryType.charAt(0).toUpperCase() + entryType.slice(1);

    switch (result.reason) {
      case 'old_age':
        return `${typeLabel} was created ${Math.round(result.ageDays ?? 0)} days ago. Consider reviewing if it's still accurate.`;

      case 'low_recency':
        return `${typeLabel} has a low recency score (${((result.recencyScore ?? 0) * 100).toFixed(0)}%). Consider validating or archiving.`;

      case 'not_accessed':
        return `${typeLabel} hasn't been accessed in ${Math.round(result.daysSinceAccess ?? 0)} days. May no longer be relevant.`;

      default:
        return `${typeLabel} may be outdated. Consider reviewing its current relevance.`;
    }
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a StaleContextDetector with configuration
 */
export function createStaleContextDetector(
  config?: Partial<StaleDetectorConfig>
): StaleContextDetector {
  const mergedConfig: StaleDetectorConfig = {
    ...DEFAULT_STALE_DETECTOR_CONFIG,
    ...config,
  };

  return new StaleContextDetector(mergedConfig);
}
