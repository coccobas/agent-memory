/**
 * Coarse-to-Fine Retrieval for Hierarchical Summaries
 *
 * Implements efficient multi-level retrieval:
 * 1. Start at highest hierarchy level (domain summaries)
 * 2. Find top-k matching summaries using embedding similarity
 * 3. For each matching summary, get its children (next level down)
 * 4. Repeat until reaching base entries (level 0)
 * 5. Return base entries with their hierarchical paths
 *
 * This enables efficient navigation: instead of searching all entries,
 * start with broad topics and progressively narrow down.
 */

import { eq, and, desc, inArray } from 'drizzle-orm';
import type { AppDb } from '../../../core/types.js';
import { summaries, summaryMembers } from '../../../db/schema.js';
import { EmbeddingService } from '../../embedding.service.js';
import { cosineSimilarity } from '../../librarian/utils/math.js';
import { createComponentLogger } from '../../../utils/logger.js';
import type {
  CoarseToFineOptions,
  CoarseToFineResult,
  RetrievalStep,
  RetrievedEntry,
  SummaryEntry,
  SummaryMemberEntry,
  DrillDownResult,
} from './types.js';

const logger = createComponentLogger('coarse-to-fine-retrieval');

/**
 * Default configuration values
 */
const DEFAULT_MAX_RESULTS = 10;
const DEFAULT_EXPANSION_FACTOR = 3;
const DEFAULT_MIN_SIMILARITY = 0.5;

/**
 * Coarse-to-Fine Retrieval Service
 *
 * Enables efficient hierarchical search through summary layers.
 */
export class CoarseToFineRetriever {
  constructor(
    private db: AppDb,
    private embeddingService: EmbeddingService
  ) {}

  /**
   * Perform coarse-to-fine hierarchical retrieval
   */
  async retrieve(options: CoarseToFineOptions): Promise<CoarseToFineResult> {
    const startTime = Date.now();
    const steps: RetrievalStep[] = [];

    // Configuration
    const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
    const expansionFactor = options.expansionFactor ?? DEFAULT_EXPANSION_FACTOR;
    const minSimilarity = options.minSimilarity ?? DEFAULT_MIN_SIMILARITY;

    // Generate or use provided query embedding
    let queryEmbedding: number[];
    if (options.queryEmbedding) {
      queryEmbedding = options.queryEmbedding;
    } else {
      if (!this.embeddingService.isAvailable()) {
        logger.warn('Embedding service not available, returning empty results');
        return {
          entries: [],
          steps: [],
          totalTimeMs: Date.now() - startTime,
        };
      }
      const result = await this.embeddingService.embed(options.query);
      queryEmbedding = result.embedding;
    }

    // Determine starting level (highest available level in scope)
    const startLevel = options.startLevel ?? (await this.getHighestLevel(options));

    logger.debug({ startLevel, query: options.query }, 'Starting coarse-to-fine retrieval');

    // Track candidates at each level
    let candidates = await this.getTopLevelSummaries(options, startLevel);
    logger.debug({ candidateCount: candidates.length, level: startLevel }, 'Got top-level candidates');

    // If no summaries exist, fall back to direct entry search
    if (candidates.length === 0) {
      logger.debug('No summaries found at top level, returning empty results');
      return {
        entries: [],
        steps: [],
        totalTimeMs: Date.now() - startTime,
        queryEmbedding,
      };
    }

    // Navigate down the hierarchy
    for (let level = startLevel; level >= 0; level--) {
      const levelStart = Date.now();

      // Score candidates by similarity
      const scored = this.scoreSummaries(candidates, queryEmbedding);
      const filtered = scored.filter(s => s.score >= minSimilarity);
      const topK = filtered.slice(0, expansionFactor);

      logger.debug(
        { level, total: scored.length, filtered: filtered.length, topK: topK.length },
        'Scored summaries at level'
      );

      steps.push({
        level,
        summariesSearched: candidates.length,
        summariesMatched: topK.length,
        timeMs: Date.now() - levelStart,
      });

      if (topK.length === 0) {
        logger.warn({ level }, 'No summaries matched at this level');
        break;
      }

      // If at level 0, we're done - these are already entries
      if (level === 0) {
        // Get final entries from summary members
        const entries = await this.getFinalEntries(topK, queryEmbedding, options);

        return {
          entries: entries.slice(0, maxResults),
          steps,
          totalTimeMs: Date.now() - startTime,
          queryEmbedding,
        };
      }

      // Otherwise, expand to next level
      candidates = await this.expandToNextLevel(topK);
      logger.debug({ level: level - 1, candidateCount: candidates.length }, 'Expanded to next level');
    }

    // Should not reach here, but handle gracefully
    return {
      entries: [],
      steps,
      totalTimeMs: Date.now() - startTime,
      queryEmbedding,
    };
  }

  /**
   * Get top-level summaries (for browsing without a query)
   */
  async getTopLevel(
    scopeType?: 'global' | 'org' | 'project' | 'session',
    scopeId?: string
  ): Promise<SummaryEntry[]> {
    const level = await this.getHighestLevel({ scopeType, scopeId });

    const conditions = [
      eq(summaries.hierarchyLevel, level),
      eq(summaries.isActive, true),
    ];

    if (scopeType) {
      conditions.push(eq(summaries.scopeType, scopeType));
      if (scopeId) {
        conditions.push(eq(summaries.scopeId, scopeId));
      }
    }

    const results = this.db
      .select()
      .from(summaries)
      .where(and(...conditions))
      .orderBy(desc(summaries.accessCount))
      .all();

    return results as SummaryEntry[];
  }

  /**
   * Drill down from a specific summary to see its children and members
   */
  async drillDown(summaryId: string, _query?: string): Promise<DrillDownResult> {
    // Get the summary
    const summary = this.db
      .select()
      .from(summaries)
      .where(eq(summaries.id, summaryId))
      .get();

    if (!summary) {
      throw new Error(`Summary not found: ${summaryId}`);
    }

    // Get members
    const memberRecords = this.db
      .select()
      .from(summaryMembers)
      .where(eq(summaryMembers.summaryId, summaryId))
      .orderBy(desc(summaryMembers.contributionScore))
      .all() as SummaryMemberEntry[];

    // Separate summary members from entry members
    const summaryMemberIds = memberRecords
      .filter(m => m.memberType === 'summary')
      .map(m => m.memberId);

    const children = summaryMemberIds.length > 0
      ? (this.db
          .select()
          .from(summaries)
          .where(inArray(summaries.id, summaryMemberIds))
          .all() as SummaryEntry[])
      : [];

    // Get entry members
    const entryMembers = memberRecords
      .filter(m => m.memberType !== 'summary')
      .map(m => ({
        id: m.memberId,
        type: m.memberType,
        score: m.contributionScore ?? 0,
      }));

    // Update access tracking
    this.db
      .update(summaries)
      .set({
        lastAccessedAt: new Date().toISOString(),
        accessCount: (summary.accessCount ?? 0) + 1,
      })
      .where(eq(summaries.id, summaryId))
      .run();

    return {
      summary: summary as SummaryEntry,
      children,
      members: entryMembers,
    };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Get the highest hierarchy level available in the given scope
   */
  private async getHighestLevel(options: Partial<CoarseToFineOptions>): Promise<number> {
    const conditions = [eq(summaries.isActive, true)];

    if (options.scopeType) {
      conditions.push(eq(summaries.scopeType, options.scopeType));
      if (options.scopeId) {
        conditions.push(eq(summaries.scopeId, options.scopeId));
      }
    }

    const result = this.db
      .select({ maxLevel: summaries.hierarchyLevel })
      .from(summaries)
      .where(and(...conditions))
      .orderBy(desc(summaries.hierarchyLevel))
      .limit(1)
      .get();

    return result?.maxLevel ?? 2; // Default to level 2 (domain)
  }

  /**
   * Get top-level summaries at the starting hierarchy level
   */
  private async getTopLevelSummaries(
    options: Partial<CoarseToFineOptions>,
    level: number
  ): Promise<SummaryEntry[]> {
    const conditions = [
      eq(summaries.hierarchyLevel, level),
      eq(summaries.isActive, true),
    ];

    if (options.scopeType) {
      conditions.push(eq(summaries.scopeType, options.scopeType));
      if (options.scopeId) {
        conditions.push(eq(summaries.scopeId, options.scopeId));
      }
    }

    const results = this.db
      .select()
      .from(summaries)
      .where(and(...conditions))
      .all();

    return results as SummaryEntry[];
  }

  /**
   * Score summaries by cosine similarity to query embedding
   */
  private scoreSummaries(
    candidates: SummaryEntry[],
    queryEmbedding: number[]
  ): Array<SummaryEntry & { score: number }> {
    return candidates
      .map(summary => {
        if (!summary.embedding || summary.embedding.length === 0) {
          return { ...summary, score: 0 };
        }

        try {
          const score = cosineSimilarity(queryEmbedding, summary.embedding);
          return { ...summary, score };
        } catch (error) {
          logger.warn(
            { summaryId: summary.id, error: error instanceof Error ? error.message : String(error) },
            'Failed to compute similarity'
          );
          return { ...summary, score: 0 };
        }
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Expand summaries to their child summaries at the next level
   */
  private async expandToNextLevel(
    parentSummaries: Array<SummaryEntry & { score: number }>
  ): Promise<SummaryEntry[]> {
    const parentIds = parentSummaries.map(s => s.id);

    if (parentIds.length === 0) {
      return [];
    }

    // Get all members of these summaries that are themselves summaries
    const members = this.db
      .select()
      .from(summaryMembers)
      .where(
        and(
          inArray(summaryMembers.summaryId, parentIds),
          eq(summaryMembers.memberType, 'summary')
        )
      )
      .all() as SummaryMemberEntry[];

    const childIds = members.map(m => m.memberId);

    if (childIds.length === 0) {
      return [];
    }

    // Fetch the child summaries
    const children = this.db
      .select()
      .from(summaries)
      .where(
        and(
          inArray(summaries.id, childIds),
          eq(summaries.isActive, true)
        )
      )
      .all();

    return children as SummaryEntry[];
  }

  /**
   * Get final entries from level-0 summaries or summary members
   */
  private async getFinalEntries(
    finalSummaries: Array<SummaryEntry & { score: number }>,
    _queryEmbedding: number[], // Reserved for future re-ranking
    options: CoarseToFineOptions
  ): Promise<RetrievedEntry[]> {
    const entries: RetrievedEntry[] = [];
    const summaryIds = finalSummaries.map(s => s.id);

    if (summaryIds.length === 0) {
      return [];
    }

    // Get all members of these summaries
    const members = this.db
      .select()
      .from(summaryMembers)
      .where(inArray(summaryMembers.summaryId, summaryIds))
      .all() as SummaryMemberEntry[];

    // Filter by entry type if specified
    const filteredMembers = options.entryTypes
      ? members.filter(m => options.entryTypes!.includes(m.memberType))
      : members;

    // Build path information for each entry
    for (const member of filteredMembers) {
      const parentSummary = finalSummaries.find(s => s.id === member.summaryId);
      if (!parentSummary) continue;

      entries.push({
        id: member.memberId,
        type: member.memberType,
        score: member.contributionScore ?? parentSummary.score,
        path: [member.summaryId], // Could be extended to show full path
        pathTitles: [parentSummary.title],
      });
    }

    // Sort by score and return
    return entries.sort((a, b) => b.score - a.score);
  }
}
