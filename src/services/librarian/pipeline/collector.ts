/**
 * Case Collector
 *
 * Gathers case experiences from the database for pattern analysis.
 * Supports filtering by scope, date range, and other criteria.
 */

import type {
  ExperienceWithVersion,
  IExperienceRepository,
} from '../../../core/interfaces/repositories.js';
import type { ExperienceTrajectoryStep, ScopeType } from '../../../db/schema.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Collector filter options
 */
export interface CollectorFilter {
  /** Scope type to collect from */
  scopeType: ScopeType;
  /** Scope ID (required for non-global scopes) */
  scopeId?: string;
  /** Include parent scopes (inherit) */
  inherit?: boolean;
  /** Only collect experiences created after this date */
  createdAfter?: Date;
  /** Only collect experiences created before this date */
  createdBefore?: Date;
  /** Only collect experiences updated after this date */
  updatedAfter?: Date;
  /** Number of days to look back (alternative to date filters) */
  lookbackDays?: number;
  /** Only collect case-level experiences */
  levelFilter?: 'case' | 'strategy' | 'all';
  /** Category filter */
  category?: string;
  /** Minimum use count */
  minUseCount?: number;
  /** Maximum number of experiences to collect */
  limit?: number;
  /** Incremental collection: only collect experiences created after this timestamp (ISO string) */
  incrementalFrom?: string;
  /** Exclude specific experience IDs (e.g., already processed ones) */
  excludeIds?: string[];
}

/**
 * Collected experience with trajectory
 */
export interface CollectedExperience {
  experience: ExperienceWithVersion;
  trajectory: ExperienceTrajectoryStep[];
}

/**
 * Collection result
 */
export interface CollectionResult {
  experiences: CollectedExperience[];
  totalFound: number;
  filter: CollectorFilter;
  collectedAt: string;
  /** Whether this was an incremental collection */
  isIncremental?: boolean;
  /** The most recent experience createdAt in this collection (for checkpoint updates) */
  latestExperienceCreatedAt?: string;
}

// =============================================================================
// CASE COLLECTOR IMPLEMENTATION
// =============================================================================

/**
 * Case Collector
 *
 * Collects case experiences for pattern analysis
 */
export class CaseCollector {
  private experienceRepo: IExperienceRepository;

  constructor(experienceRepo: IExperienceRepository) {
    this.experienceRepo = experienceRepo;
  }

  /**
   * Collect experiences matching the filter criteria
   */
  async collect(filter: CollectorFilter): Promise<CollectionResult> {
    const experienceRepo = this.experienceRepo;
    const isIncremental = !!filter.incrementalFrom;

    // Build date filters
    let createdAfter = filter.createdAfter;
    if (filter.lookbackDays && !createdAfter) {
      const lookbackDate = new Date();
      lookbackDate.setDate(lookbackDate.getDate() - filter.lookbackDays);
      createdAfter = lookbackDate;
    }

    // For incremental collection, use incrementalFrom as the cursor
    // It takes precedence over createdAfter for incremental mode
    if (filter.incrementalFrom) {
      const incrementalDate = new Date(filter.incrementalFrom);
      if (!createdAfter || incrementalDate > createdAfter) {
        createdAfter = incrementalDate;
      }
    }

    // Fetch experiences
    const experiences = await experienceRepo.list(
      {
        scopeType: filter.scopeType,
        scopeId: filter.scopeId,
        inherit: filter.inherit,
        level: filter.levelFilter === 'all' ? undefined : (filter.levelFilter ?? 'case'),
        category: filter.category,
        includeInactive: false,
      },
      {
        limit: filter.limit ?? 1000,
      }
    );

    // Filter by date if specified
    let filtered: ExperienceWithVersion[] = experiences;
    if (createdAfter) {
      const afterStr = createdAfter.toISOString();
      // For incremental mode, use > (not >=) to exclude the cursor experience itself
      if (isIncremental) {
        filtered = filtered.filter((exp: ExperienceWithVersion) => exp.createdAt > afterStr);
      } else {
        filtered = filtered.filter((exp: ExperienceWithVersion) => exp.createdAt >= afterStr);
      }
    }
    if (filter.createdBefore) {
      const beforeStr = filter.createdBefore.toISOString();
      filtered = filtered.filter((exp: ExperienceWithVersion) => exp.createdAt <= beforeStr);
    }
    if (filter.minUseCount !== undefined) {
      const minCount = filter.minUseCount;
      filtered = filtered.filter((exp: ExperienceWithVersion) => exp.useCount >= minCount);
    }

    // Exclude specific IDs if provided
    if (filter.excludeIds && filter.excludeIds.length > 0) {
      const excludeSet = new Set(filter.excludeIds);
      filtered = filtered.filter((exp: ExperienceWithVersion) => !excludeSet.has(exp.id));
    }

    // Collect trajectories for each experience
    const collected: CollectedExperience[] = [];
    for (const exp of filtered) {
      const trajectory = await experienceRepo.getTrajectory(exp.id);
      collected.push({
        experience: exp,
        trajectory,
      });
    }

    // Find the latest experience createdAt for checkpoint updates
    let latestExperienceCreatedAt: string | undefined;
    if (collected.length > 0) {
      const firstCreatedAt = collected[0]!.experience.createdAt;
      latestExperienceCreatedAt = collected.reduce((latest, ce) => {
        return ce.experience.createdAt > latest ? ce.experience.createdAt : latest;
      }, firstCreatedAt);
    }

    return {
      experiences: collected,
      totalFound: experiences.length,
      filter,
      collectedAt: new Date().toISOString(),
      isIncremental,
      latestExperienceCreatedAt,
    };
  }

  /**
   * Collect experiences from multiple scopes
   */
  async collectMultiScope(
    scopes: Array<{ scopeType: ScopeType; scopeId?: string }>,
    baseFilter: Omit<CollectorFilter, 'scopeType' | 'scopeId'>
  ): Promise<CollectionResult[]> {
    const results: CollectionResult[] = [];

    for (const scope of scopes) {
      const result = await this.collect({
        ...baseFilter,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
      });
      results.push(result);
    }

    return results;
  }

  /**
   * Collect unpromoted case experiences (candidates for pattern detection)
   */
  async collectUnpromoted(filter: CollectorFilter): Promise<CollectionResult> {
    const result = await this.collect({
      ...filter,
      levelFilter: 'case',
    });

    // Get IDs of experiences that have been promoted via relations
    // This catches promotions made via the modern relation-based system
    const promotedViaRelations = await this.experienceRepo.getPromotedExperienceIds(
      filter.scopeType,
      filter.scopeId
    );

    // Filter out experiences that have already been promoted
    // Check both legacy fields AND modern relation-based promotions
    const unpromoted = result.experiences.filter(
      (ce) =>
        !ce.experience.promotedToToolId &&
        !ce.experience.promotedFromId &&
        !promotedViaRelations.has(ce.experience.id)
    );

    return {
      ...result,
      experiences: unpromoted,
    };
  }

  /**
   * Collect unpromoted experiences incrementally from a checkpoint
   *
   * Uses timestamp cursor to only collect experiences created after the checkpoint.
   * This is more efficient than re-processing all experiences each run.
   *
   * @param filter - Base collection filter
   * @param incrementalFrom - ISO timestamp to collect experiences after (checkpoint cursor)
   * @returns Collection result with incremental flag
   */
  async collectUnpromotedIncremental(
    filter: Omit<CollectorFilter, 'incrementalFrom'>,
    incrementalFrom?: string
  ): Promise<CollectionResult> {
    const result = await this.collect({
      ...filter,
      levelFilter: 'case',
      incrementalFrom,
    });

    // Get IDs of experiences that have been promoted via relations
    // This catches promotions made via the modern relation-based system
    const promotedViaRelations = await this.experienceRepo.getPromotedExperienceIds(
      filter.scopeType,
      filter.scopeId
    );

    // Filter out experiences that have already been promoted
    // Check both legacy fields AND modern relation-based promotions
    const unpromoted = result.experiences.filter(
      (ce) =>
        !ce.experience.promotedToToolId &&
        !ce.experience.promotedFromId &&
        !promotedViaRelations.has(ce.experience.id)
    );

    return {
      ...result,
      experiences: unpromoted,
    };
  }

  /**
   * Collect experiences with successful outcomes
   */
  async collectSuccessful(filter: CollectorFilter): Promise<CollectionResult> {
    const result = await this.collect(filter);

    // Filter to experiences with successful outcomes
    const successful = result.experiences.filter((ce) => {
      const outcome = ce.experience.currentVersion?.outcome;
      if (!outcome) return false;
      const lowerOutcome = outcome.toLowerCase();
      return (
        lowerOutcome.includes('success') ||
        lowerOutcome.includes('resolved') ||
        lowerOutcome.includes('fixed') ||
        lowerOutcome.includes('completed')
      );
    });

    return {
      ...result,
      experiences: successful,
    };
  }

  /**
   * Get statistics about collectable experiences
   */
  async getStats(filter: CollectorFilter): Promise<{
    total: number;
    byLevel: Record<string, number>;
    byCategory: Record<string, number>;
    withTrajectory: number;
    promoted: number;
    unpromoted: number;
  }> {
    const result = await this.collect(filter);

    // Get IDs of experiences that have been promoted via relations
    const promotedViaRelations = await this.experienceRepo.getPromotedExperienceIds(
      filter.scopeType,
      filter.scopeId
    );

    const byLevel: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    let withTrajectory = 0;
    let promoted = 0;

    for (const ce of result.experiences) {
      // By level
      const level = ce.experience.level;
      byLevel[level] = (byLevel[level] ?? 0) + 1;

      // By category
      const category = ce.experience.category ?? 'uncategorized';
      byCategory[category] = (byCategory[category] ?? 0) + 1;

      // Has trajectory
      if (ce.trajectory.length > 0) {
        withTrajectory++;
      }

      // Promoted (check both legacy fields AND modern relation-based promotions)
      if (
        ce.experience.promotedToToolId ||
        ce.experience.promotedFromId ||
        promotedViaRelations.has(ce.experience.id)
      ) {
        promoted++;
      }
    }

    return {
      total: result.experiences.length,
      byLevel,
      byCategory,
      withTrajectory,
      promoted,
      unpromoted: result.experiences.length - promoted,
    };
  }
}

/**
 * Create a case collector instance
 */
export function createCaseCollector(experienceRepo: IExperienceRepository): CaseCollector {
  return new CaseCollector(experienceRepo);
}
