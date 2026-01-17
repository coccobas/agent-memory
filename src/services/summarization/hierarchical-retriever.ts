/**
 * Hierarchical Retriever Service
 *
 * Implements coarse-to-fine retrieval through summary hierarchies.
 * Uses the HierarchicalSummarizationService to navigate from high-level
 * summaries down to individual entries.
 *
 * This service is designed to plug into the query pipeline as the
 * `hierarchicalRetriever` dependency.
 */

import { eq, and, sql } from 'drizzle-orm';
import { createComponentLogger } from '../../utils/logger.js';
import type { AppDb } from '../../core/types.js';
import type { EmbeddingService } from '../embedding.service.js';
import type { IVectorService } from '../../core/interfaces/vector.service.js';
import type { ScopeType } from '../../db/schema.js';
import { summaries, summaryMembers } from '../../db/schema.js';

const logger = createComponentLogger('hierarchical-retriever');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Options for coarse-to-fine retrieval
 */
export interface RetrieveOptions {
  /** The search query */
  query: string;
  /** Scope type to search within */
  scopeType?: 'global' | 'org' | 'project' | 'session';
  /** Scope ID (required for non-global scopes) */
  scopeId?: string;
  /** Maximum results to return (default: 100) */
  maxResults?: number;
  /** Expansion factor at each level (default: 3) */
  expansionFactor?: number;
  /** Minimum similarity threshold (default: 0.5) */
  minSimilarity?: number;
}

/**
 * A retrieved entry with its score
 */
export interface RetrievedEntry {
  id: string;
  type: string;
  score: number;
}

/**
 * Step information for debugging
 */
export interface RetrievalStep {
  level: number;
  summariesSearched: number;
  summariesMatched: number;
  timeMs: number;
}

/**
 * Result of coarse-to-fine retrieval
 */
export interface RetrieveResult {
  /** Retrieved entries with scores */
  entries: RetrievedEntry[];
  /** Steps taken through the hierarchy */
  steps: RetrievalStep[];
  /** Total processing time in milliseconds */
  totalTimeMs: number;
}

/**
 * Configuration for the hierarchical retriever
 */
export interface HierarchicalRetrieverConfig {
  /** Maximum results to return (default: 100) */
  maxResults: number;
  /** Expansion factor at each level (default: 3) */
  expansionFactor: number;
  /** Minimum similarity threshold (default: 0.5) */
  minSimilarity: number;
}

const DEFAULT_CONFIG: HierarchicalRetrieverConfig = {
  maxResults: 100,
  expansionFactor: 3,
  minSimilarity: 0.5,
};

// =============================================================================
// HIERARCHICAL RETRIEVER SERVICE
// =============================================================================

/**
 * Hierarchical Retriever Service
 *
 * Provides coarse-to-fine retrieval through summary hierarchies.
 * Works in tandem with the query pipeline to efficiently narrow down
 * results for large memory stores.
 */
export class HierarchicalRetriever {
  private db: AppDb;
  private embeddingService: EmbeddingService;
  private vectorService: IVectorService;
  private config: HierarchicalRetrieverConfig;

  constructor(
    db: AppDb,
    embeddingService: EmbeddingService,
    vectorService: IVectorService,
    config?: Partial<HierarchicalRetrieverConfig>
  ) {
    this.db = db;
    this.embeddingService = embeddingService;
    this.vectorService = vectorService;
    this.config = { ...DEFAULT_CONFIG, ...config };

    logger.debug({ config: this.config }, 'Hierarchical retriever initialized');
  }

  /**
   * Check if summaries exist for a scope
   *
   * @param scopeType - Scope type to check
   * @param scopeId - Scope ID (null for global)
   * @returns True if summaries exist for this scope
   */
  async hasSummaries(
    scopeType: 'global' | 'org' | 'project' | 'session',
    scopeId?: string | null
  ): Promise<boolean> {
    try {
      const conditions = [
        eq(summaries.scopeType, scopeType as ScopeType),
        eq(summaries.isActive, true),
      ];

      if (scopeId) {
        conditions.push(eq(summaries.scopeId, scopeId));
      }

      const result = this.db
        .select({ count: sql<number>`count(*)` })
        .from(summaries)
        .where(and(...conditions))
        .get();

      return (result?.count ?? 0) > 0;
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error), scopeType, scopeId },
        'Error checking for summaries'
      );
      return false;
    }
  }

  /**
   * Perform coarse-to-fine retrieval through summary hierarchy
   *
   * Algorithm:
   * 1. Start at the highest level summaries (level 2 or 3)
   * 2. Search for the most relevant summaries using semantic similarity
   * 3. Expand those summaries to their children (members)
   * 4. Repeat until we reach entry level (level 0 members)
   * 5. Return scored entries
   *
   * @param options - Retrieval options
   * @returns Retrieved entries with steps for debugging
   */
  async retrieve(options: RetrieveOptions): Promise<RetrieveResult> {
    const startMs = Date.now();
    const steps: RetrievalStep[] = [];

    const maxResults = options.maxResults ?? this.config.maxResults;
    const expansionFactor = options.expansionFactor ?? this.config.expansionFactor;
    const minSimilarity = options.minSimilarity ?? this.config.minSimilarity;
    const scopeType = (options.scopeType ?? 'global') as ScopeType;
    const scopeId = options.scopeId;

    // Check if embedding service is available
    if (!this.embeddingService.isAvailable()) {
      logger.debug('Embedding service not available, skipping hierarchical retrieval');
      return { entries: [], steps: [], totalTimeMs: Date.now() - startMs };
    }

    try {
      // Generate query embedding
      const embedResult = await this.embeddingService.embed(options.query);
      const queryEmbedding = embedResult.embedding;

      // Find the highest level with summaries in this scope
      const highestLevel = await this.findHighestLevel(scopeType, scopeId);

      if (highestLevel === 0) {
        // No summaries, return empty (will fall back to standard retrieval)
        logger.debug({ scopeType, scopeId }, 'No summaries found for scope');
        return { entries: [], steps: [], totalTimeMs: Date.now() - startMs };
      }

      // Start coarse-to-fine retrieval from highest level
      let currentCandidates: Map<string, number> = new Map(); // summaryId -> score
      let level = highestLevel;

      while (level > 0) {
        const stepStart = Date.now();

        // Search summaries at current level
        const summariesToSearch =
          currentCandidates.size === 0
            ? await this.getSummariesAtLevel(level, scopeType, scopeId)
            : await this.getChildSummaryIds(Array.from(currentCandidates.keys()));

        // If no summaries to search, break
        if (summariesToSearch.length === 0) {
          steps.push({
            level,
            summariesSearched: 0,
            summariesMatched: 0,
            timeMs: Date.now() - stepStart,
          });
          break;
        }

        // Search using vector similarity
        const searchResults = await this.vectorService.searchSimilar(
          queryEmbedding,
          ['summary'],
          summariesToSearch.length // Search all at current level
        );

        // Filter to only summaries at current level and apply similarity threshold
        const levelMatches = searchResults.filter(
          (r) => summariesToSearch.includes(r.entryId) && r.score >= minSimilarity
        );

        // Take top candidates based on expansion factor
        const topCount = Math.min(
          expansionFactor * Math.max(currentCandidates.size, 1),
          levelMatches.length
        );

        currentCandidates = new Map();
        for (let i = 0; i < topCount; i++) {
          const match = levelMatches[i];
          if (match) {
            currentCandidates.set(match.entryId, match.score);
          }
        }

        steps.push({
          level,
          summariesSearched: summariesToSearch.length,
          summariesMatched: currentCandidates.size,
          timeMs: Date.now() - stepStart,
        });

        level--;
      }

      // Expand final candidates to their entry members
      const entries = await this.expandToEntries(
        Array.from(currentCandidates.keys()),
        currentCandidates,
        maxResults
      );

      const totalTimeMs = Date.now() - startMs;

      logger.debug(
        {
          query: options.query.substring(0, 50),
          scopeType,
          scopeId,
          entriesFound: entries.length,
          stepsCount: steps.length,
          totalTimeMs,
        },
        'Hierarchical retrieval completed'
      );

      return { entries, steps, totalTimeMs };
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Hierarchical retrieval failed'
      );
      return { entries: [], steps, totalTimeMs: Date.now() - startMs };
    }
  }

  /**
   * Find the highest hierarchy level with summaries in a scope
   */
  private async findHighestLevel(scopeType: ScopeType, scopeId?: string): Promise<number> {
    const conditions = [eq(summaries.scopeType, scopeType), eq(summaries.isActive, true)];

    if (scopeId) {
      conditions.push(eq(summaries.scopeId, scopeId));
    }

    const result = this.db
      .select({ maxLevel: sql<number>`max(${summaries.hierarchyLevel})` })
      .from(summaries)
      .where(and(...conditions))
      .get();

    return result?.maxLevel ?? 0;
  }

  /**
   * Get all summary IDs at a specific hierarchy level
   */
  private async getSummariesAtLevel(
    level: number,
    scopeType: ScopeType,
    scopeId?: string
  ): Promise<string[]> {
    const conditions = [
      eq(summaries.hierarchyLevel, level),
      eq(summaries.scopeType, scopeType),
      eq(summaries.isActive, true),
    ];

    if (scopeId) {
      conditions.push(eq(summaries.scopeId, scopeId));
    }

    const rows = this.db
      .select({ id: summaries.id })
      .from(summaries)
      .where(and(...conditions))
      .all();

    return rows.map((r) => r.id);
  }

  /**
   * Get child summary IDs for a set of parent summaries
   */
  private async getChildSummaryIds(parentIds: string[]): Promise<string[]> {
    if (parentIds.length === 0) return [];

    // Get members that are summaries (not entries)
    const memberRows = this.db
      .select({
        memberId: summaryMembers.memberId,
        memberType: summaryMembers.memberType,
      })
      .from(summaryMembers)
      .where(sql`${summaryMembers.summaryId} IN (${sql.join(parentIds.map((id) => sql`${id}`), sql`, `)})`)
      .all();

    // Filter to only summary members
    return memberRows.filter((m) => m.memberType === 'summary').map((m) => m.memberId);
  }

  /**
   * Expand summary IDs to their entry members with scores
   */
  private async expandToEntries(
    summaryIds: string[],
    summaryScores: Map<string, number>,
    maxResults: number
  ): Promise<RetrievedEntry[]> {
    if (summaryIds.length === 0) return [];

    // Get all members of these summaries that are entries (not summaries)
    const memberRows = this.db
      .select({
        summaryId: summaryMembers.summaryId,
        memberId: summaryMembers.memberId,
        memberType: summaryMembers.memberType,
      })
      .from(summaryMembers)
      .where(sql`${summaryMembers.summaryId} IN (${sql.join(summaryIds.map((id) => sql`${id}`), sql`, `)})`)
      .all();

    // Build entry list with inherited scores from parent summaries
    const entryScores = new Map<string, { type: string; score: number }>();

    for (const row of memberRows) {
      // Skip summary members (we want leaf entries)
      if (row.memberType === 'summary') continue;

      const parentScore = summaryScores.get(row.summaryId) ?? 0;
      const existing = entryScores.get(row.memberId);

      // Keep highest score if entry appears in multiple summaries
      if (!existing || parentScore > existing.score) {
        entryScores.set(row.memberId, {
          type: row.memberType,
          score: parentScore,
        });
      }
    }

    // Convert to array and sort by score
    const entries: RetrievedEntry[] = [];
    for (const [id, data] of entryScores) {
      entries.push({ id, type: data.type, score: data.score });
    }

    entries.sort((a, b) => b.score - a.score);

    return entries.slice(0, maxResults);
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a hierarchical retriever instance
 *
 * @param db - Database instance
 * @param embeddingService - Embedding service for query vectors
 * @param vectorService - Vector service for similarity search
 * @param config - Optional configuration overrides
 * @returns Configured retriever instance
 */
export function createHierarchicalRetriever(
  db: AppDb,
  embeddingService: EmbeddingService,
  vectorService: IVectorService,
  config?: Partial<HierarchicalRetrieverConfig>
): HierarchicalRetriever {
  return new HierarchicalRetriever(db, embeddingService, vectorService, config);
}

/**
 * Create a pipeline-compatible hierarchical retriever interface
 *
 * This wraps the HierarchicalRetriever to match the PipelineDependencies interface.
 *
 * @param retriever - The hierarchical retriever instance
 * @returns Pipeline-compatible interface
 */
export function createPipelineRetriever(retriever: HierarchicalRetriever): {
  retrieve: (options: RetrieveOptions) => Promise<RetrieveResult>;
  hasSummaries: (
    scopeType: 'global' | 'org' | 'project' | 'session',
    scopeId?: string | null
  ) => Promise<boolean>;
} {
  return {
    retrieve: (options) => retriever.retrieve(options),
    hasSummaries: (scopeType, scopeId) => retriever.hasSummaries(scopeType, scopeId),
  };
}
