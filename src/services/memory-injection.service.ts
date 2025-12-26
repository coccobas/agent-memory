/**
 * Memory Injection Service
 *
 * Retrieves relevant memory context for injection into tool calls via hooks.
 * This service is called by PreToolUse hooks to inject context before
 * Edit, Write, Bash, or other tool executions.
 *
 * Features:
 * - Intent-aware memory retrieval
 * - Tool-type specific context selection
 * - Configurable injection format (markdown, JSON, natural language)
 * - Caching for performance
 *
 * Integration:
 * - Called by PreToolUse hook via CLI command
 * - Returns formatted context to be injected into the tool call
 */

import type { DbClient } from '../db/connection.js';
import { createComponentLogger } from '../utils/logger.js';
import { IntentClassifier } from './query-rewrite/classifier.js';
import { EntityExtractor } from './query/entity-extractor.js';
import type { QueryIntent } from './query-rewrite/types.js';
import {
  guidelines,
  guidelineVersions,
  knowledge,
  knowledgeVersions,
  tools,
  toolVersions,
  experiences,
  experienceVersions,
  type ScopeType,
} from '../db/schema.js';
import { eq, and, or, desc } from 'drizzle-orm';

const logger = createComponentLogger('memory-injection');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Types of tools that can trigger memory injection
 */
export type InjectableToolType = 'Edit' | 'Write' | 'Bash' | 'Read' | 'Glob' | 'Grep' | 'other';

/**
 * Format for injected context
 */
export type InjectionFormat = 'markdown' | 'json' | 'natural_language';

/**
 * Memory injection request
 */
export interface MemoryInjectionRequest {
  /** The tool being invoked */
  toolName: InjectableToolType;
  /** Tool parameters (for context extraction) */
  toolParams?: Record<string, unknown>;
  /** Current conversation context (if available) */
  conversationContext?: string;
  /** Project ID for scoped retrieval */
  projectId?: string;
  /** Session ID for session-scoped retrieval */
  sessionId?: string;
  /** Agent ID making the request */
  agentId?: string;
  /** Desired output format */
  format?: InjectionFormat;
  /** Maximum number of entries to inject */
  maxEntries?: number;
  /** Maximum length of injected context */
  maxLength?: number;
}

/**
 * Retrieved memory entry for injection
 */
export interface InjectedMemoryEntry {
  type: 'guideline' | 'knowledge' | 'tool' | 'experience';
  id: string;
  title: string;
  content: string;
  priority?: number;
  relevanceScore: number;
}

/**
 * Memory injection result
 */
export interface MemoryInjectionResult {
  /** Whether injection was successful */
  success: boolean;
  /** Formatted context to inject */
  injectedContext: string;
  /** Individual entries that were injected */
  entries: InjectedMemoryEntry[];
  /** Detected query intent */
  detectedIntent: QueryIntent;
  /** Processing time in ms */
  processingTimeMs: number;
  /** Message for logging/debugging */
  message: string;
}

/**
 * Configuration for memory injection
 */
export interface MemoryInjectionConfig {
  /** Whether injection is enabled */
  enabled: boolean;
  /** Default format for injection */
  defaultFormat: InjectionFormat;
  /** Default max entries */
  defaultMaxEntries: number;
  /** Default max length */
  defaultMaxLength: number;
  /** Minimum relevance score to include */
  minRelevanceScore: number;
  /** Tools that trigger injection */
  injectableTools: InjectableToolType[];
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: MemoryInjectionConfig = {
  enabled: true,
  defaultFormat: 'markdown',
  defaultMaxEntries: 5,
  defaultMaxLength: 2000,
  minRelevanceScore: 0.3,
  injectableTools: ['Edit', 'Write', 'Bash'],
};

// =============================================================================
// TOOL-SPECIFIC CONTEXT EXTRACTION
// =============================================================================

/**
 * Extract search context from tool parameters
 */
function extractContextFromToolParams(
  toolName: InjectableToolType,
  params: Record<string, unknown>
): string {
  switch (toolName) {
    case 'Edit':
    case 'Write':
      // Extract file path and content hints
      const filePath = params.file_path || params.filePath || '';
      const content = params.content || params.new_string || '';
      return `${filePath} ${typeof content === 'string' ? content.slice(0, 200) : ''}`;

    case 'Bash':
      // Extract command
      const command = params.command || '';
      return typeof command === 'string' ? command : '';

    case 'Read':
    case 'Glob':
    case 'Grep':
      // Extract path/pattern
      const path = params.file_path || params.path || params.pattern || '';
      return typeof path === 'string' ? path : '';

    default:
      // Generic extraction
      return Object.values(params)
        .filter((v) => typeof v === 'string')
        .join(' ')
        .slice(0, 300);
  }
}

/**
 * Get tool-specific memory type priorities
 */
function getToolMemoryPriorities(
  toolName: InjectableToolType
): Array<'guideline' | 'knowledge' | 'tool' | 'experience'> {
  switch (toolName) {
    case 'Edit':
    case 'Write':
      // Code changes → guidelines (style, patterns), then experiences
      return ['guideline', 'experience', 'knowledge', 'tool'];

    case 'Bash':
      // Command execution → tools first, then guidelines
      return ['tool', 'guideline', 'experience', 'knowledge'];

    case 'Read':
    case 'Glob':
    case 'Grep':
      // Information gathering → knowledge first
      return ['knowledge', 'guideline', 'experience', 'tool'];

    default:
      return ['guideline', 'knowledge', 'tool', 'experience'];
  }
}

// =============================================================================
// FORMATTING
// =============================================================================

/**
 * Format entries as markdown
 */
function formatAsMarkdown(entries: InjectedMemoryEntry[]): string {
  if (entries.length === 0) {
    return '';
  }

  const sections: string[] = ['## Relevant Memory Context\n'];

  // Group by type
  const byType = new Map<string, InjectedMemoryEntry[]>();
  for (const entry of entries) {
    const existing = byType.get(entry.type) || [];
    existing.push(entry);
    byType.set(entry.type, existing);
  }

  const typeLabels: Record<string, string> = {
    guideline: 'Guidelines',
    knowledge: 'Knowledge',
    tool: 'Tools',
    experience: 'Experiences',
  };

  for (const [type, typeEntries] of byType) {
    sections.push(`### ${typeLabels[type] || type}\n`);
    for (const entry of typeEntries) {
      sections.push(`- **${entry.title}**: ${entry.content.slice(0, 200)}${entry.content.length > 200 ? '...' : ''}\n`);
    }
  }

  return sections.join('\n');
}

/**
 * Format entries as JSON
 */
function formatAsJSON(entries: InjectedMemoryEntry[]): string {
  return JSON.stringify(
    {
      memoryContext: entries.map((e) => ({
        type: e.type,
        title: e.title,
        content: e.content,
        priority: e.priority,
      })),
    },
    null,
    2
  );
}

/**
 * Format entries as natural language
 */
function formatAsNaturalLanguage(entries: InjectedMemoryEntry[]): string {
  if (entries.length === 0) {
    return '';
  }

  const parts: string[] = ['Before proceeding, consider the following relevant context:\n'];

  for (const entry of entries) {
    switch (entry.type) {
      case 'guideline':
        parts.push(`- Follow this guideline: ${entry.title} - ${entry.content.slice(0, 150)}`);
        break;
      case 'knowledge':
        parts.push(`- Remember: ${entry.title} - ${entry.content.slice(0, 150)}`);
        break;
      case 'tool':
        parts.push(`- Available tool: ${entry.title} - ${entry.content.slice(0, 150)}`);
        break;
      case 'experience':
        parts.push(`- Past experience: ${entry.title} - ${entry.content.slice(0, 150)}`);
        break;
    }
  }

  return parts.join('\n');
}

/**
 * Format entries based on requested format
 */
function formatEntries(entries: InjectedMemoryEntry[], format: InjectionFormat): string {
  switch (format) {
    case 'json':
      return formatAsJSON(entries);
    case 'natural_language':
      return formatAsNaturalLanguage(entries);
    case 'markdown':
    default:
      return formatAsMarkdown(entries);
  }
}

// =============================================================================
// MEMORY INJECTION SERVICE
// =============================================================================

/**
 * Memory Injection Service
 *
 * Retrieves and formats relevant memory for injection into tool calls.
 */
export class MemoryInjectionService {
  private _db: DbClient;
  private config: MemoryInjectionConfig;
  private classifier: IntentClassifier;
  private entityExtractor: EntityExtractor;

  constructor(db: DbClient, config?: Partial<MemoryInjectionConfig>) {
    this._db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.classifier = new IntentClassifier();
    this.entityExtractor = new EntityExtractor();
  }

  /**
   * Get the database client (for full query pipeline integration)
   */
  get db(): DbClient {
    return this._db;
  }

  /**
   * Get relevant memory context for a tool call
   *
   * @param request - The injection request
   * @returns Formatted context for injection
   */
  async getContext(request: MemoryInjectionRequest): Promise<MemoryInjectionResult> {
    const startTime = Date.now();

    // Check if injection is enabled for this tool
    if (
      !this.config.enabled ||
      !this.config.injectableTools.includes(request.toolName)
    ) {
      return {
        success: true,
        injectedContext: '',
        entries: [],
        detectedIntent: 'explore',
        processingTimeMs: 0,
        message: 'Injection skipped (tool not configured)',
      };
    }

    try {
      // Extract search context from tool params
      const toolContext = request.toolParams
        ? extractContextFromToolParams(request.toolName, request.toolParams)
        : '';

      // Combine with conversation context
      const fullContext = [request.conversationContext, toolContext]
        .filter(Boolean)
        .join(' ');

      // Classify intent
      const classification = this.classifier.classify(fullContext || request.toolName);
      const intent = classification.intent;

      // Get memory type priorities based on tool and intent
      const toolPriorities = getToolMemoryPriorities(request.toolName);
      const intentWeights = this.classifier.getMemoryTypeWeights(intent);

      // Retrieve relevant entries
      const entries = await this.retrieveRelevantEntries({
        context: fullContext,
        projectId: request.projectId,
        sessionId: request.sessionId,
        priorities: toolPriorities,
        weights: intentWeights,
        maxEntries: request.maxEntries || this.config.defaultMaxEntries,
      });

      // Format for injection
      const format = request.format || this.config.defaultFormat;
      let injectedContext = formatEntries(entries, format);

      // Truncate if too long
      const maxLength = request.maxLength || this.config.defaultMaxLength;
      if (injectedContext.length > maxLength) {
        injectedContext = injectedContext.slice(0, maxLength) + '\n...(truncated)';
      }

      const processingTimeMs = Date.now() - startTime;

      logger.debug(
        {
          toolName: request.toolName,
          intent,
          entryCount: entries.length,
          contextLength: injectedContext.length,
          processingTimeMs,
        },
        'Memory injection complete'
      );

      return {
        success: true,
        injectedContext,
        entries,
        detectedIntent: intent,
        processingTimeMs,
        message: `Injected ${entries.length} entries for ${request.toolName}`,
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;

      logger.error(
        {
          toolName: request.toolName,
          error: error instanceof Error ? error.message : String(error),
        },
        'Memory injection failed'
      );

      return {
        success: false,
        injectedContext: '',
        entries: [],
        detectedIntent: 'explore',
        processingTimeMs,
        message: `Injection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Retrieve relevant memory entries
   *
   * Queries the database for relevant entries based on:
   * - Scope (project/session)
   * - Entity matches from the context
   * - Intent-based type priorities
   */
  private async retrieveRelevantEntries(params: {
    context: string;
    projectId?: string;
    sessionId?: string;
    priorities: Array<'guideline' | 'knowledge' | 'tool' | 'experience'>;
    weights: Map<string, number>;
    maxEntries: number;
  }): Promise<InjectedMemoryEntry[]> {
    const entries: InjectedMemoryEntry[] = [];

    // Extract entities for entity-aware retrieval
    const extractedEntities = this.entityExtractor.extract(params.context);

    // Build scope conditions
    const scopeConditions: Array<ReturnType<typeof eq>> = [];
    if (params.sessionId) {
      scopeConditions.push(eq(guidelines.scopeType, 'session' as ScopeType));
    }
    if (params.projectId) {
      scopeConditions.push(eq(guidelines.scopeType, 'project' as ScopeType));
    }
    // Always include global scope
    scopeConditions.push(eq(guidelines.scopeType, 'global' as ScopeType));

    // Calculate entries per type based on weights
    const totalWeight = Array.from(params.weights.values()).reduce((a, b) => a + b, 0);
    const entriesPerType = new Map<string, number>();
    for (const type of params.priorities) {
      const weight = params.weights.get(type) ?? 0.5;
      entriesPerType.set(type, Math.max(1, Math.round((weight / totalWeight) * params.maxEntries)));
    }

    // Query each type in priority order
    for (const type of params.priorities) {
      const limit = entriesPerType.get(type) ?? 2;

      try {
        if (type === 'guideline') {
          const guidelineEntries = await this.queryGuidelines(scopeConditions, extractedEntities, limit);
          entries.push(...guidelineEntries);
        } else if (type === 'knowledge') {
          const knowledgeEntries = await this.queryKnowledge(scopeConditions, extractedEntities, limit);
          entries.push(...knowledgeEntries);
        } else if (type === 'tool') {
          const toolEntries = await this.queryTools(scopeConditions, extractedEntities, limit);
          entries.push(...toolEntries);
        } else if (type === 'experience') {
          const experienceEntries = await this.queryExperiences(scopeConditions, extractedEntities, limit);
          entries.push(...experienceEntries);
        }
      } catch (error) {
        logger.warn({ type, error: error instanceof Error ? error.message : String(error) }, 'Failed to query entries');
      }

      // Stop if we have enough entries
      if (entries.length >= params.maxEntries) {
        break;
      }
    }

    logger.debug(
      {
        context: params.context.slice(0, 100),
        projectId: params.projectId,
        priorities: params.priorities,
        entityCount: extractedEntities.length,
        retrievedCount: entries.length,
      },
      'Retrieved relevant entries'
    );

    return entries.slice(0, params.maxEntries);
  }

  /**
   * Query guidelines for injection
   * Joins with version table to get content
   */
  private async queryGuidelines(
    scopeConditions: Array<ReturnType<typeof eq>>,
    extractedEntities: Array<{ normalizedValue: string }>,
    limit: number
  ): Promise<InjectedMemoryEntry[]> {
    const whereClause = scopeConditions.length > 1
      ? or(...scopeConditions)
      : scopeConditions[0];

    const rows = this._db
      .select({
        id: guidelines.id,
        name: guidelines.name,
        content: guidelineVersions.content,
        priority: guidelines.priority,
      })
      .from(guidelines)
      .innerJoin(guidelineVersions, eq(guidelines.currentVersionId, guidelineVersions.id))
      .where(and(whereClause, eq(guidelines.isActive, true)))
      .orderBy(desc(guidelines.priority), desc(guidelines.createdAt))
      .limit(limit)
      .all();

    return rows.map((row) => ({
      type: 'guideline' as const,
      id: row.id,
      title: row.name,
      content: row.content,
      priority: row.priority ?? undefined,
      relevanceScore: this.calculateRelevanceScore(row.content, extractedEntities),
    }));
  }

  /**
   * Query knowledge entries for injection
   * Joins with version table to get content
   */
  private async queryKnowledge(
    scopeConditions: Array<ReturnType<typeof eq>>,
    extractedEntities: Array<{ normalizedValue: string }>,
    limit: number
  ): Promise<InjectedMemoryEntry[]> {
    const whereClause = scopeConditions.length > 1
      ? or(...scopeConditions)
      : scopeConditions[0];

    const rows = this._db
      .select({
        id: knowledge.id,
        title: knowledge.title,
        content: knowledgeVersions.content,
      })
      .from(knowledge)
      .innerJoin(knowledgeVersions, eq(knowledge.currentVersionId, knowledgeVersions.id))
      .where(and(whereClause, eq(knowledge.isActive, true)))
      .orderBy(desc(knowledge.createdAt))
      .limit(limit)
      .all();

    return rows.map((row) => ({
      type: 'knowledge' as const,
      id: row.id,
      title: row.title,
      content: row.content,
      relevanceScore: this.calculateRelevanceScore(row.content, extractedEntities),
    }));
  }

  /**
   * Query tools for injection
   * Joins with version table to get description
   */
  private async queryTools(
    scopeConditions: Array<ReturnType<typeof eq>>,
    extractedEntities: Array<{ normalizedValue: string }>,
    limit: number
  ): Promise<InjectedMemoryEntry[]> {
    const whereClause = scopeConditions.length > 1
      ? or(...scopeConditions)
      : scopeConditions[0];

    const rows = this._db
      .select({
        id: tools.id,
        name: tools.name,
        description: toolVersions.description,
      })
      .from(tools)
      .innerJoin(toolVersions, eq(tools.currentVersionId, toolVersions.id))
      .where(and(whereClause, eq(tools.isActive, true)))
      .orderBy(desc(tools.createdAt))
      .limit(limit)
      .all();

    return rows.map((row) => ({
      type: 'tool' as const,
      id: row.id,
      title: row.name,
      content: row.description ?? '',
      relevanceScore: this.calculateRelevanceScore(row.description ?? '', extractedEntities),
    }));
  }

  /**
   * Query experiences for injection
   */
  private async queryExperiences(
    scopeConditions: Array<ReturnType<typeof eq>>,
    extractedEntities: Array<{ normalizedValue: string }>,
    limit: number
  ): Promise<InjectedMemoryEntry[]> {
    const whereClause = scopeConditions.length > 1
      ? or(...scopeConditions)
      : scopeConditions[0];

    const rows = this._db
      .select({
        id: experiences.id,
        title: experiences.title,
        content: experienceVersions.content,
      })
      .from(experiences)
      .innerJoin(experienceVersions, eq(experiences.currentVersionId, experienceVersions.id))
      .where(and(whereClause, eq(experiences.isActive, true)))
      .orderBy(desc(experiences.createdAt))
      .limit(limit)
      .all();

    return rows.map((row) => ({
      type: 'experience' as const,
      id: row.id,
      title: row.title,
      content: row.content,
      relevanceScore: this.calculateRelevanceScore(row.content, extractedEntities),
    }));
  }

  /**
   * Calculate relevance score based on entity matches
   */
  private calculateRelevanceScore(
    content: string,
    extractedEntities: Array<{ normalizedValue: string }>
  ): number {
    if (extractedEntities.length === 0) {
      return 0.5; // Neutral score when no entities
    }

    const contentLower = content.toLowerCase();
    let matchCount = 0;

    for (const entity of extractedEntities) {
      if (contentLower.includes(entity.normalizedValue.toLowerCase())) {
        matchCount++;
      }
    }

    // Score from 0.3 (no matches) to 1.0 (all entities match)
    return 0.3 + (0.7 * (matchCount / extractedEntities.length));
  }

  /**
   * Check if a tool should trigger memory injection
   */
  shouldInject(toolName: string): boolean {
    return (
      this.config.enabled &&
      this.config.injectableTools.includes(toolName as InjectableToolType)
    );
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<MemoryInjectionConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<MemoryInjectionConfig> {
    return { ...this.config };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: MemoryInjectionService | null = null;

/**
 * Get the singleton memory injection service
 */
export function getMemoryInjectionService(db: DbClient): MemoryInjectionService {
  if (!instance) {
    instance = new MemoryInjectionService(db);
  }
  return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetMemoryInjectionService(): void {
  instance = null;
}
