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

    // Build date filters
    let createdAfter = filter.createdAfter;
    if (filter.lookbackDays && !createdAfter) {
      const lookbackDate = new Date();
      lookbackDate.setDate(lookbackDate.getDate() - filter.lookbackDays);
      createdAfter = lookbackDate;
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
      filtered = filtered.filter((exp: ExperienceWithVersion) => exp.createdAt >= afterStr);
    }
    if (filter.createdBefore) {
      const beforeStr = filter.createdBefore.toISOString();
      filtered = filtered.filter((exp: ExperienceWithVersion) => exp.createdAt <= beforeStr);
    }
    if (filter.minUseCount !== undefined) {
      const minCount = filter.minUseCount;
      filtered = filtered.filter((exp: ExperienceWithVersion) => exp.useCount >= minCount);
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

    return {
      experiences: collected,
      totalFound: experiences.length,
      filter,
      collectedAt: new Date().toISOString(),
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

    // Filter out experiences that have already been promoted
    const unpromoted = result.experiences.filter(
      (ce) => !ce.experience.promotedToToolId && !ce.experience.promotedFromId
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

      // Promoted
      if (ce.experience.promotedToToolId || ce.experience.promotedFromId) {
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
