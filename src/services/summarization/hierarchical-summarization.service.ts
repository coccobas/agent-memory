/**
 * Hierarchical Summarization Service
 *
 * Orchestrates multi-level summarization of memory entries using:
 * 1. Community detection (Leiden algorithm) to group similar entries
 * 2. LLM-based summarization to create concise summaries
 * 3. Recursive summarization to build hierarchy levels
 *
 * Summaries are stored in the dedicated summaries table with membership
 * tracked in summaryMembers for efficient traversal.
 *
 * NOTE: Non-null assertions used for array/Map access after validation checks
 * and embedding operations in hierarchical algorithms.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { eq, and, sql, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { createComponentLogger } from '../../utils/logger.js';
import { createServiceUnavailableError } from '../../core/errors.js';
import type { AppDb } from '../../core/types.js';
import type { EmbeddingService } from '../embedding.service.js';
import type { ExtractionService } from '../extraction.service.js';
import type { IVectorService } from '../../core/interfaces/vector.service.js';
import type {
  HierarchicalSummarizationConfig,
  BuildSummariesOptions,
  BuildSummariesResult,
  SummaryEntry,
  SearchSummariesOptions,
  SummaryBuildStatus,
  SummarizableEntry,
  SummarizationRequest,
  HierarchyLevel,
} from './types.js';
import type { CommunityNode } from './community-detection/types.js';
import { DEFAULT_HIERARCHICAL_SUMMARIZATION_CONFIG } from './types.js';
// Community detection
import { detectCommunities as detectCommunitiesAlgo } from './community-detection/index.js';
// LLM Summarizer
import { LLMSummarizer } from './summarizer/llm-summarizer.js';
import type { SummarizationItem } from './summarizer/types.js';
// Database schema
import {
  tools,
  toolVersions,
  guidelines,
  guidelineVersions,
  knowledge,
  knowledgeVersions,
  summaries,
  summaryMembers,
  type ScopeType,
} from '../../db/schema.js';

const logger = createComponentLogger('hierarchical-summarization');

/**
 * Hierarchical Summarization Service
 *
 * Main orchestrator for building and managing hierarchical summaries
 * of memory entries across multiple levels.
 *
 * @experimental Most methods are not yet implemented and will throw errors.
 */
export class HierarchicalSummarizationService {
  private config: HierarchicalSummarizationConfig;

  // Core dependencies
  private db: AppDb;
  private embeddingService: EmbeddingService;
  private extractionService: ExtractionService | undefined;
  private vectorService: IVectorService;

  // LLM summarizer for generating summaries
  private summarizer: LLMSummarizer | null = null;

  // Effective similarity threshold for current build operation
  private effectiveSimilarityThreshold: number;

  constructor(
    db: AppDb,
    embeddingService: EmbeddingService,
    extractionService: ExtractionService | undefined,
    vectorService: IVectorService,
    config?: Partial<HierarchicalSummarizationConfig>
  ) {
    this.db = db;
    this.embeddingService = embeddingService;
    this.extractionService = extractionService;
    this.vectorService = vectorService;

    // If no provider explicitly set, inherit from extraction service
    const effectiveProvider =
      config?.provider ?? (extractionService?.isAvailable() ? 'openai' : 'disabled');

    this.config = {
      ...DEFAULT_HIERARCHICAL_SUMMARIZATION_CONFIG,
      ...config,
      provider: effectiveProvider,
    };

    logger.debug(
      {
        passedProvider: config?.provider,
        extractionAvailable: extractionService?.isAvailable() ?? false,
        effectiveProvider,
        finalProvider: this.config.provider,
        defaultProvider: DEFAULT_HIERARCHICAL_SUMMARIZATION_CONFIG.provider,
      },
      'Summarization service config initialized'
    );

    // Initialize LLM summarizer if provider is configured
    if (this.config.provider !== 'disabled') {
      try {
        this.summarizer = new LLMSummarizer({
          provider: this.config.provider,
          model: this.config.model,
          // API keys should come from environment or config
          openaiApiKey: process.env.AGENT_MEMORY_OPENAI_API_KEY,
          openaiBaseUrl: process.env.AGENT_MEMORY_EXTRACTION_OPENAI_BASE_URL,
          anthropicApiKey: process.env.AGENT_MEMORY_ANTHROPIC_API_KEY,
          ollamaBaseUrl: process.env.AGENT_MEMORY_OLLAMA_BASE_URL,
        });
      } catch (error) {
        logger.warn({ error: String(error) }, 'Failed to initialize LLM summarizer');
      }
    }

    // Initialize with config default
    this.effectiveSimilarityThreshold = this.config.similarityThreshold;

    logger.debug(
      { config: this.config, hasSummarizer: !!this.summarizer },
      'Hierarchical summarization service initialized'
    );
  }

  /** Get database instance (for subclasses/testing) */
  protected getDb(): AppDb {
    return this.db;
  }

  /** Get embedding service (for subclasses/testing) */
  protected getEmbeddingService(): EmbeddingService {
    return this.embeddingService;
  }

  /** Get extraction service (for subclasses/testing) */
  protected getExtractionService(): ExtractionService | undefined {
    return this.extractionService;
  }

  /** Get vector service (for subclasses/testing) */
  protected getVectorService(): IVectorService {
    return this.vectorService;
  }

  /**
   * Build hierarchical summaries for a scope
   *
   * This is the main entry point that:
   * 1. Fetches entries from the scope
   * 2. Gets embeddings for all entries
   * 3. Detects communities using Leiden algorithm
   * 4. Summarizes each community using LLM
   * 5. Recursively builds higher levels until maxLevels or single summary
   *
   * @param options - Build options
   * @returns Build result with statistics
   */
  async buildSummaries(options: BuildSummariesOptions): Promise<BuildSummariesResult> {
    const startTime = Date.now();

    logger.info(
      {
        scopeType: options.scopeType,
        scopeId: options.scopeId,
        entryTypes: options.entryTypes,
        forceRebuild: options.forceRebuild,
      },
      'Building hierarchical summaries'
    );

    // Check if provider is available
    if (this.config.provider === 'disabled') {
      throw createServiceUnavailableError(
        'Summarization',
        'provider is disabled. Configure AGENT_MEMORY_EXTRACTION_PROVIDER to enable'
      );
    }

    // Determine effective configuration
    const maxLevels = options.maxLevels ?? this.config.maxLevels;
    const minGroupSize = options.minGroupSize ?? this.config.minGroupSize;
    const similarityThreshold = options.similarityThreshold ?? this.config.similarityThreshold;
    const entryTypes =
      options.entryTypes ?? (['tool', 'guideline', 'knowledge', 'experience'] as const);

    // Store effective threshold for use in detectCommunities
    this.effectiveSimilarityThreshold = similarityThreshold;

    // Delete existing summaries if force rebuild
    if (options.forceRebuild) {
      await this.deleteSummaries(options.scopeType, options.scopeId);
    }

    // Step 1: Fetch entries from the scope
    const entries = await this.fetchEntriesForSummarization(
      options.scopeType,
      options.scopeId,
      entryTypes
    );

    if (entries.length === 0) {
      logger.info('No entries found to summarize');
      return {
        summariesCreated: 0,
        levelsBuilt: 0,
        processingTimeMs: Date.now() - startTime,
        summariesByLevel: { level1: 0, level2: 0, level3: 0 },
        stats: {
          entriesProcessed: 0,
          communitiesByLevel: [],
          avgCohesionByLevel: [],
        },
      };
    }

    logger.debug({ entryCount: entries.length }, 'Fetched entries for summarization');

    // Step 2: Get embeddings for all entries (use cache or generate)
    const entriesWithEmbeddings = await this.ensureEmbeddings(entries);

    // Step 3: Build hierarchy recursively
    const result = await this.buildHierarchyRecursive(
      entriesWithEmbeddings,
      1, // Start at level 1
      maxLevels,
      minGroupSize,
      options.scopeType,
      options.scopeId
    );

    const processingTimeMs = Date.now() - startTime;

    logger.info(
      {
        summariesCreated: result.summariesCreated,
        levelsBuilt: result.levelsBuilt,
        processingTimeMs,
      },
      'Hierarchical summaries built successfully'
    );

    return {
      ...result,
      processingTimeMs,
      stats: {
        entriesProcessed: entries.length,
        communitiesByLevel: result.stats.communitiesByLevel,
        avgCohesionByLevel: result.stats.avgCohesionByLevel,
      },
    };
  }

  /**
   * Get a summary by ID
   */
  async getSummary(id: string): Promise<SummaryEntry | null> {
    const startMs = Date.now();

    try {
      // Query summary by ID
      const summaryRow = this.db
        .select()
        .from(summaries)
        .where(and(eq(summaries.id, id), eq(summaries.isActive, true)))
        .get();

      if (!summaryRow) {
        return null;
      }

      // Query members
      const memberRows = this.db
        .select({
          memberId: summaryMembers.memberId,
          memberType: summaryMembers.memberType,
        })
        .from(summaryMembers)
        .where(eq(summaryMembers.summaryId, id))
        .orderBy(summaryMembers.displayOrder)
        .all();

      // Build SummaryEntry
      // Note: Drizzle with mode: 'json' automatically parses embedding
      const entry: SummaryEntry = {
        id: summaryRow.id,
        hierarchyLevel: summaryRow.hierarchyLevel as HierarchyLevel,
        title: summaryRow.title,
        content: summaryRow.content,
        parentSummaryId: summaryRow.parentSummaryId ?? undefined,
        memberIds: memberRows.map((m) => m.memberId),
        memberCount: summaryRow.memberCount ?? memberRows.length,
        embedding: summaryRow.embedding ?? undefined,
        scopeType: summaryRow.scopeType,
        scopeId: summaryRow.scopeId ?? undefined,
        createdAt: summaryRow.createdAt,
        updatedAt: summaryRow.updatedAt ?? undefined,
        metadata: {
          cohesion: summaryRow.coherenceScore ?? undefined,
        },
      };

      logger.debug(
        {
          summaryId: id,
          hierarchyLevel: entry.hierarchyLevel,
          memberCount: entry.memberCount,
          processingTimeMs: Date.now() - startMs,
        },
        'Retrieved summary by ID'
      );

      return entry;
    } catch (error) {
      logger.error({ error, summaryId: id }, 'Failed to get summary');
      throw error;
    }
  }

  /**
   * Get summaries at a specific hierarchy level
   */
  async getSummariesAtLevel(
    level: HierarchyLevel,
    scopeType: string,
    scopeId?: string
  ): Promise<SummaryEntry[]> {
    const startMs = Date.now();

    try {
      // Build conditions
      const conditions = [
        eq(summaries.hierarchyLevel, level),
        eq(summaries.scopeType, scopeType as ScopeType),
        eq(summaries.isActive, true),
      ];

      if (scopeId) {
        conditions.push(eq(summaries.scopeId, scopeId));
      }

      // Query summaries at level
      const summaryRows = this.db
        .select()
        .from(summaries)
        .where(and(...conditions))
        .orderBy(summaries.createdAt)
        .all();

      // Fetch members for each summary
      const entries: SummaryEntry[] = [];
      for (const summaryRow of summaryRows) {
        const memberRows = this.db
          .select({
            memberId: summaryMembers.memberId,
            memberType: summaryMembers.memberType,
          })
          .from(summaryMembers)
          .where(eq(summaryMembers.summaryId, summaryRow.id))
          .orderBy(summaryMembers.displayOrder)
          .all();

        entries.push({
          id: summaryRow.id,
          hierarchyLevel: summaryRow.hierarchyLevel as HierarchyLevel,
          title: summaryRow.title,
          content: summaryRow.content,
          parentSummaryId: summaryRow.parentSummaryId ?? undefined,
          memberIds: memberRows.map((m) => m.memberId),
          memberCount: summaryRow.memberCount ?? memberRows.length,
          embedding: summaryRow.embedding ?? undefined,
          scopeType: summaryRow.scopeType,
          scopeId: summaryRow.scopeId ?? undefined,
          createdAt: summaryRow.createdAt,
          updatedAt: summaryRow.updatedAt ?? undefined,
          metadata: {
            cohesion: summaryRow.coherenceScore ?? undefined,
          },
        });
      }

      logger.debug(
        {
          level,
          scopeType,
          scopeId,
          summaryCount: entries.length,
          processingTimeMs: Date.now() - startMs,
        },
        'Retrieved summaries at level'
      );

      return entries;
    } catch (error) {
      logger.error({ error, level, scopeType, scopeId }, 'Failed to get summaries at level');
      throw error;
    }
  }

  /**
   * Get children of a summary (entries or lower-level summaries)
   */
  async getChildSummaries(parentId: string): Promise<SummaryEntry[]> {
    const startMs = Date.now();

    try {
      // Query summaries by parent ID
      const summaryRows = this.db
        .select()
        .from(summaries)
        .where(and(eq(summaries.parentSummaryId, parentId), eq(summaries.isActive, true)))
        .orderBy(summaries.hierarchyLevel, summaries.createdAt)
        .all();

      // Fetch members for each summary
      const entries: SummaryEntry[] = [];
      for (const summaryRow of summaryRows) {
        const memberRows = this.db
          .select({
            memberId: summaryMembers.memberId,
            memberType: summaryMembers.memberType,
          })
          .from(summaryMembers)
          .where(eq(summaryMembers.summaryId, summaryRow.id))
          .orderBy(summaryMembers.displayOrder)
          .all();

        entries.push({
          id: summaryRow.id,
          hierarchyLevel: summaryRow.hierarchyLevel as HierarchyLevel,
          title: summaryRow.title,
          content: summaryRow.content,
          parentSummaryId: summaryRow.parentSummaryId ?? undefined,
          memberIds: memberRows.map((m) => m.memberId),
          memberCount: summaryRow.memberCount ?? memberRows.length,
          embedding: summaryRow.embedding ?? undefined,
          scopeType: summaryRow.scopeType,
          scopeId: summaryRow.scopeId ?? undefined,
          createdAt: summaryRow.createdAt,
          updatedAt: summaryRow.updatedAt ?? undefined,
          metadata: {
            cohesion: summaryRow.coherenceScore ?? undefined,
          },
        });
      }

      logger.debug(
        {
          parentId,
          childCount: entries.length,
          processingTimeMs: Date.now() - startMs,
        },
        'Retrieved child summaries'
      );

      return entries;
    } catch (error) {
      logger.error({ error, parentId }, 'Failed to get child summaries');
      throw error;
    }
  }

  /**
   * Search summaries using semantic or text search
   */
  async searchSummaries(query: string, options?: SearchSummariesOptions): Promise<SummaryEntry[]> {
    const startMs = Date.now();
    const limit = options?.limit ?? 10;

    try {
      // Strategy 1: Semantic search if embeddings available
      if (this.embeddingService.isAvailable() && this.vectorService) {
        const embedResult = await this.embeddingService.embed(query);
        const searchResults = await this.vectorService.searchSimilar(
          embedResult.embedding,
          ['summary'],
          limit * 2 // Get extra for filtering
        );

        const entries: SummaryEntry[] = [];
        for (const result of searchResults) {
          if (entries.length >= limit) break;

          const summary = await this.getSummary(result.entryId);
          if (!summary) continue;

          // Apply filters
          if (options?.level !== undefined && summary.hierarchyLevel !== options.level) {
            continue;
          }
          if (options?.scopeType && summary.scopeType !== options.scopeType) {
            continue;
          }
          if (options?.scopeId && summary.scopeId !== options.scopeId) {
            continue;
          }

          entries.push(summary);
        }

        logger.debug(
          {
            query,
            strategy: 'semantic',
            resultCount: entries.length,
            processingTimeMs: Date.now() - startMs,
          },
          'Searched summaries'
        );

        return entries;
      }

      // Strategy 2: Fallback to text search
      // Drizzle conditions are complex - using any for dynamic condition building
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const conditions: any[] = [eq(summaries.isActive, true)];

      // Text search condition
      conditions.push(
        or(
          sql`${summaries.title} LIKE ${`%${query}%`}`,
          sql`${summaries.content} LIKE ${`%${query}%`}`
        )
      );

      // Apply optional filters
      if (options?.level !== undefined) {
        conditions.push(eq(summaries.hierarchyLevel, options.level));
      }
      if (options?.scopeType) {
        conditions.push(eq(summaries.scopeType, options.scopeType as ScopeType));
      }
      if (options?.scopeId) {
        conditions.push(eq(summaries.scopeId, options.scopeId));
      }

      const summaryRows = this.db
        .select()
        .from(summaries)
        // Drizzle conditions are complex - using any for flexibility
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        .where(and(...conditions))
        .limit(limit)
        .all();

      // Convert to entries
      const entries: SummaryEntry[] = [];
      for (const summaryRow of summaryRows) {
        const memberRows = this.db
          .select({
            memberId: summaryMembers.memberId,
            memberType: summaryMembers.memberType,
          })
          .from(summaryMembers)
          .where(eq(summaryMembers.summaryId, summaryRow.id))
          .orderBy(summaryMembers.displayOrder)
          .all();

        entries.push({
          id: summaryRow.id,
          hierarchyLevel: summaryRow.hierarchyLevel as HierarchyLevel,
          title: summaryRow.title,
          content: summaryRow.content,
          parentSummaryId: summaryRow.parentSummaryId ?? undefined,
          memberIds: memberRows.map((m) => m.memberId),
          memberCount: summaryRow.memberCount ?? memberRows.length,
          embedding: summaryRow.embedding ?? undefined,
          scopeType: summaryRow.scopeType,
          scopeId: summaryRow.scopeId ?? undefined,
          createdAt: summaryRow.createdAt,
          updatedAt: summaryRow.updatedAt ?? undefined,
          metadata: {
            cohesion: summaryRow.coherenceScore ?? undefined,
          },
        });
      }

      logger.debug(
        {
          query,
          strategy: 'text',
          resultCount: entries.length,
          processingTimeMs: Date.now() - startMs,
        },
        'Searched summaries'
      );

      return entries;
    } catch (error) {
      logger.error({ error, query }, 'Failed to search summaries');
      throw error;
    }
  }

  /**
   * Get build status for a scope
   */
  async getStatus(scopeType: string, scopeId?: string): Promise<SummaryBuildStatus> {
    const startMs = Date.now();

    try {
      // Build conditions
      const conditions = [
        eq(summaries.scopeType, scopeType as ScopeType),
        eq(summaries.isActive, true),
      ];

      if (scopeId) {
        conditions.push(eq(summaries.scopeId, scopeId));
      }

      // Query all summaries in scope
      const allSummaries = this.db
        .select({
          hierarchyLevel: summaries.hierarchyLevel,
          memberCount: summaries.memberCount,
          createdAt: summaries.createdAt,
        })
        .from(summaries)
        .where(and(...conditions))
        .all();

      // Calculate statistics
      const countByLevel: { level1: number; level2: number; level3: number } = {
        level1: 0,
        level2: 0,
        level3: 0,
      };
      let entriesCovered = 0;
      let lastBuilt: string | undefined;

      for (const summary of allSummaries) {
        // Count by level
        if (summary.hierarchyLevel === 1) {
          countByLevel.level1++;
          // Only count level 1 to avoid double-counting
          entriesCovered += summary.memberCount ?? 0;
        } else if (summary.hierarchyLevel === 2) {
          countByLevel.level2++;
        } else if (summary.hierarchyLevel === 3) {
          countByLevel.level3++;
        }

        // Track latest build time
        if (!lastBuilt || summary.createdAt > lastBuilt) {
          lastBuilt = summary.createdAt;
        }
      }

      const status: SummaryBuildStatus = {
        lastBuilt,
        summaryCount: allSummaries.length,
        countByLevel,
        entriesCovered,
      };

      logger.debug(
        {
          scopeType,
          scopeId,
          status,
          processingTimeMs: Date.now() - startMs,
        },
        'Retrieved summarization status'
      );

      return status;
    } catch (error) {
      logger.error({ error, scopeType, scopeId }, 'Failed to get summarization status');
      throw error;
    }
  }

  /**
   * Delete all summaries for a scope
   *
   * Deletes summaries and their member relationships from the database.
   * Uses CASCADE delete on summaryMembers via foreign key constraint.
   */
  async deleteSummaries(scopeType: string, scopeId?: string): Promise<number> {
    logger.debug({ scopeType, scopeId }, 'Deleting summaries');

    // Build conditions
    const conditions = [eq(summaries.scopeType, scopeType as ScopeType)];
    if (scopeId) {
      conditions.push(eq(summaries.scopeId, scopeId));
    }

    // Count existing summaries before delete
    const existing = this.db
      .select({ count: summaries.id })
      .from(summaries)
      .where(and(...conditions))
      .all();

    const count = existing.length;

    if (count > 0) {
      // Delete summaries (CASCADE will delete summaryMembers)
      this.db
        .delete(summaries)
        .where(and(...conditions))
        .run();
      logger.debug({ count }, 'Deleted summaries');
    }

    return count;
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  /**
   * Recursively build hierarchy levels
   */
  private async buildHierarchyRecursive(
    entries: SummarizableEntry[],
    currentLevel: HierarchyLevel,
    maxLevels: number,
    minGroupSize: number,
    scopeType: 'global' | 'org' | 'project' | 'session',
    scopeId?: string
  ): Promise<
    Omit<BuildSummariesResult, 'processingTimeMs' | 'stats'> & {
      stats: { communitiesByLevel: number[]; avgCohesionByLevel: number[] };
    }
  > {
    // Base case: reached max levels or too few entries
    if (currentLevel > maxLevels || entries.length < minGroupSize) {
      return {
        summariesCreated: 0,
        levelsBuilt: 0,
        summariesByLevel: { level1: 0, level2: 0, level3: 0 },
        topLevelSummary: entries.length === 1 ? this.toSummaryEntry(entries[0]!) : undefined,
        stats: { communitiesByLevel: [], avgCohesionByLevel: [] },
      };
    }

    logger.debug({ currentLevel, entryCount: entries.length }, 'Building hierarchy level');

    // Step 1: Detect communities
    const communities = await this.detectCommunities(entries);

    if (communities.length === 0) {
      logger.warn('No communities detected, stopping hierarchy build');
      return {
        summariesCreated: 0,
        levelsBuilt: 0,
        summariesByLevel: { level1: 0, level2: 0, level3: 0 },
        stats: { communitiesByLevel: [], avgCohesionByLevel: [] },
      };
    }

    logger.debug({ communityCount: communities.length }, 'Detected communities');

    // Step 2: Summarize each community
    const summaries: SummarizableEntry[] = [];
    let summariesCreated = 0;

    for (const community of communities) {
      // Skip communities smaller than minGroupSize
      if (community.members.length < minGroupSize) {
        logger.debug(
          { communitySize: community.members.length, minGroupSize },
          'Skipping small community'
        );
        continue;
      }

      // Map community nodes back to summarizable entries
      const communityEntries = community.members
        .map((node) => entries.find((e) => e.id === node.id))
        .filter((e): e is SummarizableEntry => e !== undefined);

      if (communityEntries.length === 0) continue;

      // Generate summary for this community
      const summary = await this.summarizeCommunity({
        entries: communityEntries,
        targetLevel: currentLevel,
        scopeType,
        scopeId,
      });

      // Store summary as knowledge entry
      await this.storeSummary(summary.summary);

      summaries.push(this.toSummarizableEntry(summary.summary));
      summariesCreated++;
    }

    // Calculate statistics
    const avgCohesion =
      communities.length > 0
        ? communities.reduce((sum, c) => sum + c.cohesion, 0) / communities.length
        : 0;

    // Update summary count by level
    const summariesByLevel = { level1: 0, level2: 0, level3: 0 };
    if (currentLevel === 1) summariesByLevel.level1 = summariesCreated;
    else if (currentLevel === 2) summariesByLevel.level2 = summariesCreated;
    else if (currentLevel === 3) summariesByLevel.level3 = summariesCreated;

    // Base case: if we created only 1 summary, we've reached the top
    if (summaries.length === 1) {
      return {
        summariesCreated,
        levelsBuilt: 1,
        summariesByLevel,
        topLevelSummary: this.toSummaryEntry(summaries[0]!),
        stats: {
          communitiesByLevel: [communities.length],
          avgCohesionByLevel: [avgCohesion],
        },
      };
    }

    // Recursive case: build next level with summaries
    const nextLevelResult = await this.buildHierarchyRecursive(
      summaries,
      (currentLevel + 1) as HierarchyLevel,
      maxLevels,
      minGroupSize,
      scopeType,
      scopeId
    );

    // Combine results
    return {
      summariesCreated: summariesCreated + nextLevelResult.summariesCreated,
      levelsBuilt: 1 + nextLevelResult.levelsBuilt,
      summariesByLevel: {
        level1: summariesByLevel.level1 + nextLevelResult.summariesByLevel.level1,
        level2: summariesByLevel.level2 + nextLevelResult.summariesByLevel.level2,
        level3: summariesByLevel.level3 + nextLevelResult.summariesByLevel.level3,
      },
      topLevelSummary: nextLevelResult.topLevelSummary,
      stats: {
        communitiesByLevel: [communities.length, ...nextLevelResult.stats.communitiesByLevel],
        avgCohesionByLevel: [avgCohesion, ...nextLevelResult.stats.avgCohesionByLevel],
      },
    };
  }

  /**
   * Fetch entries from the scope for summarization
   */
  private async fetchEntriesForSummarization(
    scopeType: string,
    scopeId: string | undefined,
    entryTypes: Array<'tool' | 'guideline' | 'knowledge' | 'experience'>
  ): Promise<SummarizableEntry[]> {
    logger.debug({ scopeType, scopeId, entryTypes }, 'Fetching entries for summarization');

    const entries: SummarizableEntry[] = [];

    // Build scope conditions
    // Drizzle table types are complex - using any for generic table constraints
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buildConditions = <T extends { scopeType: any; scopeId: any; isActive: any }>(
      table: T
    ) => {
      const conditions = [eq(table.scopeType, scopeType as ScopeType), eq(table.isActive, true)];
      if (scopeId) {
        conditions.push(eq(table.scopeId, scopeId));
      }
      return and(...conditions);
    };

    // Fetch tools
    if (entryTypes.includes('tool')) {
      const toolEntries = this.db.select().from(tools).where(buildConditions(tools)).all();

      for (const tool of toolEntries) {
        const version = tool.currentVersionId
          ? this.db
              .select()
              .from(toolVersions)
              .where(eq(toolVersions.id, tool.currentVersionId))
              .get()
          : null;

        const text = this.buildToolText(tool, version ?? null);
        entries.push({
          id: tool.id,
          type: 'tool',
          text,
          embedding: [],
          hierarchyLevel: 0,
          metadata: { category: tool.category ?? undefined, createdAt: tool.createdAt },
        });
      }
    }

    // Fetch guidelines
    if (entryTypes.includes('guideline')) {
      const guidelineEntries = this.db
        .select()
        .from(guidelines)
        .where(buildConditions(guidelines))
        .all();

      for (const guideline of guidelineEntries) {
        const version = guideline.currentVersionId
          ? this.db
              .select()
              .from(guidelineVersions)
              .where(eq(guidelineVersions.id, guideline.currentVersionId))
              .get()
          : null;

        const text = this.buildGuidelineText(guideline, version ?? null);
        entries.push({
          id: guideline.id,
          type: 'guideline',
          text,
          embedding: [],
          hierarchyLevel: 0,
          metadata: {
            category: guideline.category ?? undefined,
            priority: guideline.priority,
            createdAt: guideline.createdAt,
          },
        });
      }
    }

    // Fetch knowledge
    if (entryTypes.includes('knowledge')) {
      const knowledgeEntries = this.db
        .select()
        .from(knowledge)
        .where(buildConditions(knowledge))
        .all();

      for (const entry of knowledgeEntries) {
        const version = entry.currentVersionId
          ? this.db
              .select()
              .from(knowledgeVersions)
              .where(eq(knowledgeVersions.id, entry.currentVersionId))
              .get()
          : null;

        const text = this.buildKnowledgeText(entry, version ?? null);
        entries.push({
          id: entry.id,
          type: 'knowledge',
          text,
          embedding: [],
          hierarchyLevel: 0,
          metadata: { category: entry.category ?? undefined, createdAt: entry.createdAt },
        });
      }
    }

    // Note: 'experience' type not implemented yet - skip for now

    logger.debug({ entryCount: entries.length }, 'Fetched entries for summarization');
    return entries;
  }

  /**
   * Build text representation for a tool entry
   */
  private buildToolText(
    tool: typeof tools.$inferSelect,
    version: typeof toolVersions.$inferSelect | null
  ): string {
    const parts = [`Tool: ${tool.name}`];
    if (version?.description) {
      parts.push(`Description: ${version.description}`);
    }
    if (version?.constraints) {
      parts.push(`Constraints: ${version.constraints}`);
    }
    return parts.join('\n');
  }

  /**
   * Build text representation for a guideline entry
   */
  private buildGuidelineText(
    guideline: typeof guidelines.$inferSelect,
    version: typeof guidelineVersions.$inferSelect | null
  ): string {
    const parts = [`Guideline: ${guideline.name}`];
    if (version?.content) {
      parts.push(`Content: ${version.content}`);
    }
    if (version?.rationale) {
      parts.push(`Rationale: ${version.rationale}`);
    }
    return parts.join('\n');
  }

  /**
   * Build text representation for a knowledge entry
   */
  private buildKnowledgeText(
    entry: typeof knowledge.$inferSelect,
    version: typeof knowledgeVersions.$inferSelect | null
  ): string {
    const parts = [`Knowledge: ${entry.title}`];
    if (version?.content) {
      parts.push(`Content: ${version.content}`);
    }
    if (version?.source) {
      parts.push(`Source: ${version.source}`);
    }
    return parts.join('\n');
  }

  /**
   * Ensure all entries have embeddings
   *
   * First attempts to load existing embeddings from the vector store.
   * For entries without embeddings, generates them using the embedding service.
   * Uses batch embedding for efficiency.
   */
  private async ensureEmbeddings(entries: SummarizableEntry[]): Promise<SummarizableEntry[]> {
    // Step 1: Try to load existing embeddings from vector store
    if (this.vectorService && 'getByEntryIds' in this.vectorService) {
      const entryIds = entries.map((e) => ({
        entryType: e.type,
        entryId: e.id,
      }));

      try {
        const existingEmbeddings = await (
          this.vectorService as {
            getByEntryIds: (
              ids: Array<{ entryType: string; entryId: string }>
            ) => Promise<Map<string, number[]>>;
          }
        ).getByEntryIds(entryIds);

        // Map embeddings back to entries
        let loadedCount = 0;
        for (const entry of entries) {
          const key = `${entry.type}:${entry.id}`;
          const embedding = existingEmbeddings.get(key);
          if (embedding && embedding.length > 0) {
            entry.embedding = embedding;
            loadedCount++;
          }
        }

        if (loadedCount > 0) {
          logger.debug(
            { loadedCount, totalEntries: entries.length },
            'Loaded existing embeddings from vector store'
          );
        }
      } catch (error) {
        logger.warn({ error: String(error) }, 'Failed to load embeddings from vector store');
      }
    }

    // Step 2: Check for entries still needing embeddings
    const entriesNeedingEmbeddings = entries.filter(
      (e) => !e.embedding || e.embedding.length === 0
    );

    if (entriesNeedingEmbeddings.length === 0) {
      logger.debug('All entries have embeddings (loaded from vector store)');
      return entries;
    }

    // Step 3: Generate embeddings for remaining entries
    if (!this.embeddingService.isAvailable()) {
      logger.warn(
        { missingCount: entriesNeedingEmbeddings.length },
        'Embedding service not available, some entries will lack embeddings'
      );
      return entries;
    }

    logger.debug(
      { count: entriesNeedingEmbeddings.length },
      'Generating embeddings for entries without cached embeddings'
    );

    // Batch embed texts
    const texts = entriesNeedingEmbeddings.map((e) => e.text);

    try {
      const result = await this.embeddingService.embedBatch(texts);

      // Map embeddings back to entries
      for (let i = 0; i < entriesNeedingEmbeddings.length; i++) {
        const embedding = result.embeddings[i];
        if (embedding) {
          entriesNeedingEmbeddings[i]!.embedding = embedding;
        }
      }

      logger.debug({ count: result.embeddings.length }, 'Generated embeddings for entries');
    } catch (error) {
      logger.error({ error: String(error) }, 'Failed to generate embeddings');
      // Continue without embeddings - community detection will fail gracefully
    }

    return entries;
  }

  /**
   * Detect communities using Leiden algorithm
   *
   * Converts entries to CommunityNodes and runs the Leiden algorithm
   * to cluster similar entries together.
   */
  private async detectCommunities(
    entries: SummarizableEntry[]
  ): Promise<Array<{ id: string; members: CommunityNode[]; cohesion: number }>> {
    logger.debug({ entryCount: entries.length }, 'Detecting communities');

    // Filter entries with valid embeddings
    const entriesWithEmbeddings = entries.filter((e) => e.embedding && e.embedding.length > 0);

    if (entriesWithEmbeddings.length === 0) {
      logger.warn('No entries with embeddings available for community detection');
      return [];
    }

    // Convert to CommunityNodes
    const nodes: CommunityNode[] = entriesWithEmbeddings.map((entry) => ({
      id: entry.id,
      type: entry.type as CommunityNode['type'],
      embedding: entry.embedding,
      metadata: entry.metadata,
    }));

    // Run community detection with effective threshold (may be overridden per-build)
    try {
      const result = await detectCommunitiesAlgo(nodes, {
        resolution: this.config.communityResolution,
        minCommunitySize: this.config.minGroupSize,
        similarityThreshold: this.effectiveSimilarityThreshold,
      });

      logger.debug(
        {
          communityCount: result.communities.length,
          modularity: result.modularity,
          processingTimeMs: result.processingTimeMs,
        },
        'Community detection completed'
      );

      return result.communities.map((community) => ({
        id: community.id,
        members: community.members,
        cohesion: community.cohesion,
      }));
    } catch (error) {
      logger.error({ error: String(error) }, 'Community detection failed');
      return [];
    }
  }

  /**
   * Summarize a community of entries using LLM
   *
   * Converts entries to SummarizationItems and calls the LLMSummarizer
   * to generate a concise summary.
   */
  private async summarizeCommunity(
    request: SummarizationRequest
  ): Promise<{ summary: SummaryEntry; processingTimeMs: number; tokensUsed?: number }> {
    const startTime = Date.now();

    logger.debug(
      { entryCount: request.entries.length, targetLevel: request.targetLevel },
      'Summarizing community'
    );

    // Convert entries to SummarizationItems
    const items: SummarizationItem[] = request.entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      title: this.extractTitle(entry),
      content: entry.text,
      metadata: {
        category: entry.metadata?.category as string | undefined,
        keyTerms: entry.metadata?.keyTerms as string[] | undefined,
      },
    }));

    // Generate summary using LLM (or fallback)
    let title = `Summary of ${request.entries.length} entries`;
    let content = this.generateFallbackContent(request.entries);
    let embedding: number[] | undefined;

    if (this.summarizer?.isAvailable()) {
      try {
        const result = await this.summarizer.summarize({
          items,
          hierarchyLevel: request.targetLevel,
          scopeContext: request.scopeId,
        });

        title = result.title;
        content = result.content;

        logger.debug(
          { title, contentLength: content.length, provider: result.provider },
          'LLM summarization completed'
        );
      } catch (error) {
        logger.warn({ error: String(error) }, 'LLM summarization failed, using fallback');
      }
    }

    // Generate embedding for the summary
    if (this.embeddingService.isAvailable()) {
      try {
        const embeddingResult = await this.embeddingService.embed(content);
        embedding = embeddingResult.embedding;
      } catch (error) {
        logger.warn({ error: String(error) }, 'Failed to generate summary embedding');
      }
    }

    const summaryId = uuidv4();
    const summary: SummaryEntry = {
      id: summaryId,
      hierarchyLevel: request.targetLevel,
      title,
      content,
      embedding,
      memberIds: request.entries.map((e) => e.id),
      memberCount: request.entries.length,
      scopeType: request.scopeType,
      scopeId: request.scopeId,
      createdAt: new Date().toISOString(),
      metadata: {
        cohesion: this.calculateCohesion(request.entries),
        processingTimeMs: Date.now() - startTime,
      },
    };

    return {
      summary,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Extract a title from an entry
   */
  private extractTitle(entry: SummarizableEntry): string {
    // Extract title from text (first line or first N chars)
    const firstLine = entry.text.split('\n')[0] ?? '';
    const titleMatch = firstLine.match(/^(?:Tool|Guideline|Knowledge):\s*(.+)$/);
    return titleMatch?.[1] ?? firstLine.slice(0, 50);
  }

  /**
   * Generate fallback content when LLM is unavailable
   */
  private generateFallbackContent(entries: SummarizableEntry[]): string {
    const typeGroups = new Map<string, SummarizableEntry[]>();
    for (const entry of entries) {
      const group = typeGroups.get(entry.type) || [];
      group.push(entry);
      typeGroups.set(entry.type, group);
    }

    const parts: string[] = [];
    for (const [type, group] of typeGroups) {
      parts.push(`${type}s (${group.length}):`);
      for (const entry of group.slice(0, 5)) {
        parts.push(`  - ${this.extractTitle(entry)}`);
      }
      if (group.length > 5) {
        parts.push(`  ... and ${group.length - 5} more`);
      }
    }
    return parts.join('\n');
  }

  /**
   * Calculate cohesion score from entries with embeddings
   */
  private calculateCohesion(entries: SummarizableEntry[]): number {
    const withEmbeddings = entries.filter((e) => e.embedding && e.embedding.length > 0);
    if (withEmbeddings.length < 2) return 1.0;

    // Calculate average pairwise similarity
    let totalSimilarity = 0;
    let pairCount = 0;

    for (let i = 0; i < withEmbeddings.length; i++) {
      for (let j = i + 1; j < withEmbeddings.length; j++) {
        const a = withEmbeddings[i]!.embedding;
        const b = withEmbeddings[j]!.embedding;
        totalSimilarity += this.cosineSimilarity(a, b);
        pairCount++;
      }
    }

    return pairCount > 0 ? totalSimilarity / pairCount : 1.0;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator > 0 ? dotProduct / denominator : 0;
  }

  /**
   * Store a summary in the summaries table
   *
   * Inserts the summary and its member relationships into the database.
   */
  private async storeSummary(summary: SummaryEntry): Promise<void> {
    logger.debug({ summaryId: summary.id, level: summary.hierarchyLevel }, 'Storing summary');

    // Insert into summaries table
    // Note: Drizzle with mode: 'json' handles serialization automatically
    this.db
      .insert(summaries)
      .values({
        id: summary.id,
        scopeType: summary.scopeType,
        scopeId: summary.scopeId,
        hierarchyLevel: summary.hierarchyLevel,
        parentSummaryId: summary.parentSummaryId,
        title: summary.title,
        content: summary.content,
        memberCount: summary.memberCount,
        embedding: summary.embedding,
        embeddingDimension: summary.embedding?.length,
        coherenceScore: summary.metadata?.cohesion,
        isActive: true,
        needsRegeneration: false,
        createdBy: 'hierarchical-summarization',
      })
      .run();

    // Insert member relationships
    for (let i = 0; i < summary.memberIds.length; i++) {
      const memberId = summary.memberIds[i]!;
      // Determine member type based on original entry type
      // For now, we'll use a simple heuristic based on the prefix
      const memberType = this.inferMemberType(memberId);

      this.db
        .insert(summaryMembers)
        .values({
          id: uuidv4(),
          summaryId: summary.id,
          memberType,
          memberId,
          displayOrder: i,
        })
        .run();
    }

    logger.debug(
      { summaryId: summary.id, memberCount: summary.memberIds.length },
      'Summary stored successfully'
    );

    // Store in vector store for semantic search
    if (summary.embedding && summary.embedding.length > 0 && this.vectorService) {
      try {
        await this.vectorService.storeEmbedding(
          'summary', // entryType
          summary.id, // entryId
          summary.id, // indexId (same as entryId for summaries)
          summary.content, // text content for fallback
          summary.embedding,
          this.embeddingService.getProvider()
        );
        logger.debug({ summaryId: summary.id }, 'Stored summary embedding in vector store');
      } catch (error) {
        logger.warn(
          { error, summaryId: summary.id },
          'Failed to store summary embedding in vector store (non-fatal)'
        );
      }
    }
  }

  /**
   * Infer member type from member ID
   * In a production system, this would look up the actual entry type.
   */
  private inferMemberType(
    _memberId: string
  ): 'tool' | 'guideline' | 'knowledge' | 'experience' | 'summary' {
    // For now, default to 'knowledge' as the most common type
    // A more robust implementation would track entry types during fetch
    return 'knowledge';
  }

  /**
   * Convert SummarizableEntry to SummaryEntry
   */
  private toSummaryEntry(entry: SummarizableEntry): SummaryEntry {
    // Placeholder conversion
    return {
      id: entry.id,
      hierarchyLevel: entry.hierarchyLevel,
      title: `Summary of ${entry.id}`,
      content: entry.text,
      memberIds: [entry.id],
      memberCount: 1,
      scopeType: 'project',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Convert SummaryEntry to SummarizableEntry
   */
  private toSummarizableEntry(summary: SummaryEntry): SummarizableEntry {
    return {
      id: summary.id,
      type: 'summary',
      text: summary.content,
      embedding: summary.embedding ?? [],
      hierarchyLevel: summary.hierarchyLevel,
      metadata: summary.metadata,
    };
  }
}
