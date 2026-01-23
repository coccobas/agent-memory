/**
 * Unified Context Service
 *
 * Single source of truth for context retrieval across all use cases:
 * - Session start (memory_quickstart)
 * - Tool injection (PreToolUse hook)
 * - User queries (memory_query context)
 *
 * Integrates with ContextManagerService for budget, staleness, compression.
 */

import { createComponentLogger } from '../../utils/logger.js';
import type { DbClient } from '../../db/connection.js';
import type { ScopeType } from '../../db/schema.js';
import {
  guidelines,
  guidelineVersions,
  knowledge,
  knowledgeVersions,
  tools,
  toolVersions,
  experiences,
  experienceVersions,
  tags,
  entryTags,
} from '../../db/schema.js';
import { eq, and, or, desc, inArray, type SQL } from 'drizzle-orm';
import type { ContextManagerService } from './context-manager.service.js';
import {
  createContextManagerService,
  type ContextEntry,
  type ContextManagerConfig,
} from './context-manager.service.js';
import type { QueryIntent } from '../query-rewrite/types.js';
import { config } from '../../config/index.js';
import type { PurposeBudgetConfig } from '../../config/registry/sections/contextBudget.js';

const logger = createComponentLogger('unified-context');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Purpose for context retrieval
 */
export type ContextPurpose =
  | { type: 'session_start' }
  | { type: 'tool_injection'; toolName: string }
  | { type: 'query'; query?: string }
  | { type: 'custom'; complexity?: 'simple' | 'moderate' | 'complex' | 'critical' };

/**
 * Entry types to include
 */
export type IncludableEntryType = 'guidelines' | 'knowledge' | 'tools' | 'experiences';

/**
 * Request for unified context
 */
export interface UnifiedContextRequest {
  /** Purpose determines budget and behavior */
  purpose: ContextPurpose;
  /** Scope type */
  scopeType: ScopeType;
  /** Scope ID (required for non-global) */
  scopeId?: string;
  /** Session ID for session-scoped queries */
  sessionId?: string;
  /** Project ID (can differ from scopeId for session scope) */
  projectId?: string;
  /** Output format */
  format?: 'markdown' | 'json' | 'natural_language';
  /** Budget override ('auto' or explicit token count) */
  budget?: 'auto' | number;
  /** Entry types to include (default: all) */
  include?: IncludableEntryType[];
  /** Exclude stale entries from output */
  excludeStale?: boolean;
  /** Maximum entries (soft limit) */
  maxEntries?: number;
}

/**
 * Staleness warning
 */
export interface StalenessWarning {
  entryId: string;
  entryType: 'guideline' | 'knowledge' | 'tool' | 'experience';
  reason: 'old_age' | 'low_recency' | 'not_accessed';
  ageDays?: number;
  recommendation: string;
}

/**
 * Result of unified context retrieval
 */
export interface UnifiedContextResult {
  /** Whether retrieval succeeded */
  success: boolean;
  /** Formatted context content */
  content: string;
  /** Included entries */
  entries: Array<{
    id: string;
    type: 'guideline' | 'knowledge' | 'tool' | 'experience';
    title: string;
    content: string;
    priority?: number;
  }>;
  /** Statistics */
  stats: {
    entriesIncluded: number;
    entriesExcluded: number;
    tokensUsed: number;
    tokenBudget: number;
    compressionLevel: 'none' | 'hierarchical' | 'llm' | 'truncated';
    processingTimeMs: number;
  };
  /** Staleness warnings */
  stalenessWarnings: StalenessWarning[];
  /** Budget information */
  budgetInfo: {
    allocated: number;
    used: number;
    complexity: 'simple' | 'moderate' | 'complex' | 'critical';
  };
  /** Error message if failed */
  error?: string;
}

/**
 * Scope filter for queries (type + optional ID)
 */
interface ScopeFilter {
  scopeType: ScopeType;
  scopeId?: string;
}

/**
 * Tool tag filter for tool_injection purpose
 */
interface ToolTagFilter {
  toolName: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

function getPurposeBudgets(): Record<ContextPurpose['type'], PurposeBudgetConfig> {
  const cb = config.contextBudget;
  return {
    session_start: {
      default: cb.sessionStartDefault,
      min: cb.sessionStartMin,
      max: cb.sessionStartMax,
    },
    tool_injection: {
      default: cb.toolInjectionDefault,
      min: cb.toolInjectionMin,
      max: cb.toolInjectionMax,
    },
    query: {
      default: cb.queryDefault,
      min: cb.queryMin,
      max: cb.queryMax,
    },
    custom: {
      default: cb.customDefault,
      min: cb.customMin,
      max: cb.customMax,
    },
  };
}

/**
 * Default entry types by purpose
 */
const PURPOSE_DEFAULT_INCLUDE: Record<ContextPurpose['type'], IncludableEntryType[]> = {
  session_start: ['guidelines', 'knowledge', 'tools', 'experiences'],
  tool_injection: ['guidelines', 'knowledge', 'experiences'],
  query: ['guidelines', 'knowledge', 'tools', 'experiences'],
  custom: ['guidelines', 'knowledge', 'tools', 'experiences'],
};

/**
 * Map purpose to QueryIntent for ContextManager
 * Valid intents: lookup, how_to, debug, explore, compare, configure
 */
function purposeToIntent(purpose: ContextPurpose): QueryIntent {
  switch (purpose.type) {
    case 'session_start':
      return 'explore'; // Open-ended discovery for session context
    case 'tool_injection':
      return 'lookup'; // Find specific facts relevant to tool
    case 'query':
      return 'explore'; // Comprehensive search
    case 'custom':
      return purpose.complexity === 'complex' || purpose.complexity === 'critical'
        ? 'debug' // Problem-solving for complex tasks
        : 'lookup'; // Simple lookup for others
    default:
      return 'explore';
  }
}

// =============================================================================
// SERVICE
// =============================================================================

/**
 * UnifiedContextService provides a single API for all context retrieval.
 *
 * It wraps the ContextManagerService and adds:
 * - Purpose-based configuration
 * - Entry retrieval from database
 * - Scope resolution
 */
export class UnifiedContextService {
  private contextManager: ContextManagerService;

  constructor(
    private readonly db: DbClient,
    contextManagerConfig?: Partial<ContextManagerConfig>
  ) {
    // Create context manager with default config
    this.contextManager = createContextManagerService(
      null, // prioritization service (can be set later)
      null, // summarization service (can be set later)
      {
        enabled: true,
        staleness: { enabled: true, staleAgeDays: 90, notAccessedDays: 60 },
        budget: { enabled: true, baseBudget: 2000, maxBudget: 8000 },
        priority: { enabled: true, minScore: 0.3 },
        compression: { enabled: true, hierarchicalThreshold: 1500 },
        ...contextManagerConfig,
      }
    );
  }

  /**
   * Get context for a specific purpose
   */
  async getContext(request: UnifiedContextRequest): Promise<UnifiedContextResult> {
    const startTime = Date.now();

    try {
      // Validate request
      if (request.scopeType !== 'global' && !request.scopeId) {
        return this.errorResult(`scopeId required for ${request.scopeType} scope`, startTime);
      }

      // Determine budget
      const purposeBudgets = getPurposeBudgets();
      const purposeConfig = purposeBudgets[request.purpose.type];
      let budget: number;
      if (request.budget === 'auto' || request.budget === undefined) {
        budget = purposeConfig.default;
      } else {
        budget = Math.max(purposeConfig.min, Math.min(purposeConfig.max, request.budget));
      }

      // Determine entry types to include
      const include = request.include ?? PURPOSE_DEFAULT_INCLUDE[request.purpose.type];

      // Retrieve entries from database
      const entries = await this.retrieveEntries(request, include);

      if (entries.length === 0) {
        return this.emptyResult(budget, request.purpose, startTime);
      }

      // Convert to ContextEntry format
      const contextEntries: ContextEntry[] = entries.map((e) => ({
        id: e.id,
        type: e.type,
        title: e.title,
        content: e.content,
        priority: e.priority,
        relevanceScore: e.relevanceScore,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        accessedAt: e.accessedAt,
      }));

      // Process through context manager
      const intent = purposeToIntent(request.purpose);
      const result = await this.contextManager.process({
        entries: contextEntries,
        intent,
        format: request.format ?? 'markdown',
        maxTokens: budget,
        maxEntries: request.maxEntries,
        scopeId: request.projectId ?? request.scopeId,
      });

      // Map staleness warnings
      const stalenessWarnings: StalenessWarning[] = result.stalenessWarnings.map((w) => ({
        entryId: w.entryId,
        entryType: w.entryType,
        reason: w.reason,
        ageDays: w.ageDays,
        recommendation: w.recommendation,
      }));

      // Filter stale if requested
      let includedEntries = result.includedEntries;
      if (request.excludeStale && stalenessWarnings.length > 0) {
        const staleIds = new Set(stalenessWarnings.map((w) => w.entryId));
        includedEntries = includedEntries.filter((e) => !staleIds.has(e.id));
      }

      const processingTimeMs = Date.now() - startTime;

      return {
        success: true,
        content: result.content,
        entries: includedEntries.map((e) => ({
          id: e.id,
          type: e.type,
          title: e.title ?? '',
          content: e.content,
          priority: e.priority,
        })),
        stats: {
          entriesIncluded: includedEntries.length,
          entriesExcluded: result.excludedEntries.length,
          tokensUsed: result.stats.finalTokens,
          tokenBudget: budget,
          compressionLevel: result.compressionLevel,
          processingTimeMs,
        },
        stalenessWarnings: request.excludeStale ? [] : stalenessWarnings,
        budgetInfo: {
          allocated: budget,
          used: result.stats.finalTokens,
          complexity: result.budget.complexity,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get context');
      return this.errorResult(error instanceof Error ? error.message : 'Unknown error', startTime);
    }
  }

  /**
   * Get budget configuration for all purposes
   */
  getBudgetInfo(): Record<string, PurposeBudgetConfig> {
    return { ...getPurposeBudgets() };
  }

  /**
   * Get budget for a specific purpose
   */
  getBudgetForPurpose(purpose: ContextPurpose): number {
    return getPurposeBudgets()[purpose.type].default;
  }

  /**
   * Get default include types for a purpose
   */
  getDefaultInclude(purpose: ContextPurpose): IncludableEntryType[] {
    return [...PURPOSE_DEFAULT_INCLUDE[purpose.type]];
  }

  /**
   * Scope filter with both type and ID
   */
  private buildScopeFilters(request: UnifiedContextRequest): ScopeFilter[] {
    const filters: ScopeFilter[] = [];

    // Always include global scope (no scopeId needed)
    filters.push({ scopeType: 'global' });

    // Add project scope if projectId or scopeId provided
    const projectId =
      request.projectId ?? (request.scopeType === 'project' ? request.scopeId : undefined);
    if (projectId) {
      filters.push({ scopeType: 'project', scopeId: projectId });
    }

    // Add session scope if sessionId provided
    if (request.sessionId) {
      filters.push({ scopeType: 'session', scopeId: request.sessionId });
    }

    return filters;
  }

  /**
   * Retrieve entries from database
   */
  private async retrieveEntries(
    request: UnifiedContextRequest,
    include: IncludableEntryType[]
  ): Promise<ContextEntry[]> {
    const entries: ContextEntry[] = [];
    const scopeFilters = this.buildScopeFilters(request);

    // Extract tool name for tool_injection purpose
    const toolTagFilter: ToolTagFilter | undefined =
      request.purpose.type === 'tool_injection' && request.purpose.toolName
        ? { toolName: request.purpose.toolName }
        : undefined;

    // Query each type
    if (include.includes('guidelines')) {
      const guidelineEntries = this.queryGuidelines(scopeFilters, toolTagFilter);
      entries.push(...guidelineEntries);
    }

    if (include.includes('knowledge')) {
      const knowledgeEntries = this.queryKnowledge(scopeFilters, toolTagFilter);
      entries.push(...knowledgeEntries);
    }

    if (include.includes('tools')) {
      const toolEntries = this.queryTools(scopeFilters);
      entries.push(...toolEntries);
    }

    if (include.includes('experiences')) {
      const experienceEntries = this.queryExperiences(scopeFilters, toolTagFilter);
      entries.push(...experienceEntries);
    }

    return entries;
  }

  /**
   * Query guidelines
   */
  private queryGuidelines(
    scopeFilters: ScopeFilter[],
    toolTagFilter?: ToolTagFilter
  ): ContextEntry[] {
    const scopeConditions: SQL[] = [];
    for (const f of scopeFilters) {
      const condition =
        f.scopeType === 'global'
          ? eq(guidelines.scopeType, 'global')
          : and(eq(guidelines.scopeType, f.scopeType), eq(guidelines.scopeId, f.scopeId!));
      if (condition) {
        scopeConditions.push(condition);
      }
    }

    // If no valid scope conditions, return empty results
    if (scopeConditions.length === 0) {
      return [];
    }

    const whereClause = scopeConditions.length > 1 ? or(...scopeConditions) : scopeConditions[0];

    // If tool tag filter provided, find entries with matching tool:* tag
    let toolTaggedIds: string[] | undefined;
    if (toolTagFilter) {
      const tagName = `tool:${toolTagFilter.toolName}`;
      toolTaggedIds = this.db
        .select({ entryId: entryTags.entryId })
        .from(entryTags)
        .innerJoin(tags, eq(entryTags.tagId, tags.id))
        .where(and(eq(entryTags.entryType, 'guideline'), eq(tags.name, tagName)))
        .all()
        .map((r) => r.entryId);

      // If no entries have this tool tag, fall back to unfiltered query
      if (toolTaggedIds.length === 0) {
        logger.debug(
          { toolName: toolTagFilter.toolName },
          'No guidelines with tool tag, using fallback'
        );
        toolTaggedIds = undefined;
      }
    }

    let baseCondition = and(eq(guidelines.isActive, true), whereClause);
    if (toolTaggedIds && toolTaggedIds.length > 0) {
      baseCondition = and(baseCondition, inArray(guidelines.id, toolTaggedIds));
    }

    const rows = this.db
      .select({
        id: guidelines.id,
        name: guidelines.name,
        content: guidelineVersions.content,
        priority: guidelines.priority,
        createdAt: guidelines.createdAt,
        accessedAt: guidelines.lastAccessedAt,
      })
      .from(guidelines)
      .innerJoin(guidelineVersions, eq(guidelines.currentVersionId, guidelineVersions.id))
      .where(baseCondition)
      .orderBy(desc(guidelines.priority))
      .limit(20)
      .all();

    return rows.map((row) => ({
      id: row.id,
      type: 'guideline' as const,
      title: row.name,
      content: row.content ?? '',
      priority: row.priority ?? 5,
      createdAt: row.createdAt,
      updatedAt: row.createdAt, // Use createdAt as fallback
      accessedAt: row.accessedAt,
    }));
  }

  /**
   * Query knowledge
   */
  private queryKnowledge(
    scopeFilters: ScopeFilter[],
    toolTagFilter?: ToolTagFilter
  ): ContextEntry[] {
    const scopeConditions: SQL[] = [];
    for (const f of scopeFilters) {
      const condition =
        f.scopeType === 'global'
          ? eq(knowledge.scopeType, 'global')
          : and(eq(knowledge.scopeType, f.scopeType), eq(knowledge.scopeId, f.scopeId!));
      if (condition) {
        scopeConditions.push(condition);
      }
    }

    if (scopeConditions.length === 0) {
      return [];
    }

    const whereClause = scopeConditions.length > 1 ? or(...scopeConditions) : scopeConditions[0];

    let toolTaggedIds: string[] | undefined;
    if (toolTagFilter) {
      const tagName = `tool:${toolTagFilter.toolName}`;
      toolTaggedIds = this.db
        .select({ entryId: entryTags.entryId })
        .from(entryTags)
        .innerJoin(tags, eq(entryTags.tagId, tags.id))
        .where(and(eq(entryTags.entryType, 'knowledge'), eq(tags.name, tagName)))
        .all()
        .map((r) => r.entryId);

      if (toolTaggedIds.length === 0) {
        logger.debug(
          { toolName: toolTagFilter.toolName },
          'No knowledge with tool tag, using fallback'
        );
        toolTaggedIds = undefined;
      }
    }

    let baseCondition = and(eq(knowledge.isActive, true), whereClause);
    if (toolTaggedIds && toolTaggedIds.length > 0) {
      baseCondition = and(baseCondition, inArray(knowledge.id, toolTaggedIds));
    }

    const rows = this.db
      .select({
        id: knowledge.id,
        title: knowledge.title,
        content: knowledgeVersions.content,
        createdAt: knowledge.createdAt,
        accessedAt: knowledge.lastAccessedAt,
      })
      .from(knowledge)
      .innerJoin(knowledgeVersions, eq(knowledge.currentVersionId, knowledgeVersions.id))
      .where(baseCondition)
      .orderBy(desc(knowledge.createdAt))
      .limit(20)
      .all();

    return rows.map((row) => ({
      id: row.id,
      type: 'knowledge' as const,
      title: row.title ?? '',
      content: row.content ?? '',
      priority: 5,
      createdAt: row.createdAt,
      updatedAt: row.createdAt,
      accessedAt: row.accessedAt,
    }));
  }

  /**
   * Query tools
   */
  private queryTools(scopeFilters: ScopeFilter[]): ContextEntry[] {
    const scopeConditions: SQL[] = [];
    for (const f of scopeFilters) {
      const condition =
        f.scopeType === 'global'
          ? eq(tools.scopeType, 'global')
          : and(eq(tools.scopeType, f.scopeType), eq(tools.scopeId, f.scopeId!));
      if (condition) {
        scopeConditions.push(condition);
      }
    }

    if (scopeConditions.length === 0) {
      return [];
    }

    const whereClause = scopeConditions.length > 1 ? or(...scopeConditions) : scopeConditions[0];

    const rows = this.db
      .select({
        id: tools.id,
        name: tools.name,
        description: toolVersions.description,
        createdAt: tools.createdAt,
        accessedAt: tools.lastAccessedAt,
      })
      .from(tools)
      .innerJoin(toolVersions, eq(tools.currentVersionId, toolVersions.id))
      .where(and(eq(tools.isActive, true), whereClause))
      .orderBy(desc(tools.createdAt))
      .limit(10)
      .all();

    return rows.map((row) => ({
      id: row.id,
      type: 'tool' as const,
      title: row.name,
      content: row.description ?? '',
      priority: 4,
      createdAt: row.createdAt,
      updatedAt: row.createdAt,
      accessedAt: row.accessedAt,
    }));
  }

  /**
   * Query experiences
   */
  private queryExperiences(
    scopeFilters: ScopeFilter[],
    toolTagFilter?: ToolTagFilter
  ): ContextEntry[] {
    const scopeConditions: SQL[] = [];
    for (const f of scopeFilters) {
      const condition =
        f.scopeType === 'global'
          ? eq(experiences.scopeType, 'global')
          : and(eq(experiences.scopeType, f.scopeType), eq(experiences.scopeId, f.scopeId!));
      if (condition) {
        scopeConditions.push(condition);
      }
    }

    if (scopeConditions.length === 0) {
      return [];
    }

    const whereClause = scopeConditions.length > 1 ? or(...scopeConditions) : scopeConditions[0];

    let toolTaggedIds: string[] | undefined;
    if (toolTagFilter) {
      const tagName = `tool:${toolTagFilter.toolName}`;
      toolTaggedIds = this.db
        .select({ entryId: entryTags.entryId })
        .from(entryTags)
        .innerJoin(tags, eq(entryTags.tagId, tags.id))
        .where(and(eq(entryTags.entryType, 'experience'), eq(tags.name, tagName)))
        .all()
        .map((r) => r.entryId);

      if (toolTaggedIds.length === 0) {
        logger.debug(
          { toolName: toolTagFilter.toolName },
          'No experiences with tool tag, using fallback'
        );
        toolTaggedIds = undefined;
      }
    }

    let baseCondition = and(eq(experiences.isActive, true), whereClause);
    if (toolTaggedIds && toolTaggedIds.length > 0) {
      baseCondition = and(baseCondition, inArray(experiences.id, toolTaggedIds));
    }

    const rows = this.db
      .select({
        id: experiences.id,
        title: experiences.title,
        content: experienceVersions.content,
        outcome: experienceVersions.outcome,
        createdAt: experiences.createdAt,
        lastUsedAt: experiences.lastUsedAt,
      })
      .from(experiences)
      .innerJoin(experienceVersions, eq(experiences.currentVersionId, experienceVersions.id))
      .where(baseCondition)
      .orderBy(desc(experiences.createdAt))
      .limit(10)
      .all();

    return rows.map((row) => ({
      id: row.id,
      type: 'experience' as const,
      title: row.title ?? '',
      content: row.content ?? row.outcome ?? '',
      priority: 6,
      createdAt: row.createdAt,
      updatedAt: row.createdAt,
      accessedAt: row.lastUsedAt,
    }));
  }

  /**
   * Create empty result
   */
  private emptyResult(
    budget: number,
    purpose: ContextPurpose,
    startTime: number
  ): UnifiedContextResult {
    return {
      success: true,
      content: '',
      entries: [],
      stats: {
        entriesIncluded: 0,
        entriesExcluded: 0,
        tokensUsed: 0,
        tokenBudget: budget,
        compressionLevel: 'none',
        processingTimeMs: Date.now() - startTime,
      },
      stalenessWarnings: [],
      budgetInfo: {
        allocated: budget,
        used: 0,
        complexity: purpose.type === 'query' ? 'moderate' : 'simple',
      },
    };
  }

  /**
   * Create error result
   */
  private errorResult(message: string, startTime: number): UnifiedContextResult {
    return {
      success: false,
      content: '',
      entries: [],
      stats: {
        entriesIncluded: 0,
        entriesExcluded: 0,
        tokensUsed: 0,
        tokenBudget: 0,
        compressionLevel: 'none',
        processingTimeMs: Date.now() - startTime,
      },
      stalenessWarnings: [],
      budgetInfo: {
        allocated: 0,
        used: 0,
        complexity: 'simple',
      },
      error: message,
    };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a UnifiedContextService
 */
export function createUnifiedContextService(
  db: DbClient,
  config?: Partial<ContextManagerConfig>
): UnifiedContextService {
  return new UnifiedContextService(db, config);
}
