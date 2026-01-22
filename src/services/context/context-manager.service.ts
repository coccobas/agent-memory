/**
 * Context Manager Service
 *
 * Orchestrates all context management components for enhanced memory injection:
 * - Dynamic budget calculation
 * - Priority-based entry selection
 * - Staleness detection and warnings
 * - Progressive compression
 */

import { createComponentLogger } from '../../utils/logger.js';
import type { QueryIntent } from '../query-rewrite/types.js';
import type { SmartPrioritizationService } from '../prioritization/smart-prioritization.service.js';
import type { IHierarchicalSummarizationService } from '../../core/context.js';
import type { StaleContextDetector } from './stale-detector.js';
import {
  createStaleContextDetector,
  type StaleDetectorConfig,
  type StalenessEntry,
  type StalenessWarning,
} from './stale-detector.js';
import type { DynamicBudgetCalculator } from './budget-calculator.js';
import {
  createBudgetCalculator,
  type BudgetCalculatorConfig,
  type BudgetResult,
  type TaskComplexity,
} from './budget-calculator.js';
import type { PriorityIntegrationService } from './priority-integration.js';
import {
  createPriorityIntegrationService,
  type PriorityIntegrationConfig,
  type PrioritizableEntry,
} from './priority-integration.js';
import type { CompressionManager } from './compression-manager.js';
import {
  createCompressionManager,
  type CompressionManagerConfig,
  type CompressibleEntry,
  type CompressionLevel,
} from './compression-manager.js';
import type { ComplexitySignals } from '../../utils/transcript-analysis.js';

const logger = createComponentLogger('context-manager');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Entry for context management (union of all entry requirements)
 */
export interface ContextEntry {
  id: string;
  type: 'guideline' | 'knowledge' | 'tool' | 'experience';
  title?: string;
  content: string;
  priority?: number;
  relevanceScore?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  accessedAt?: string | null;
}

/**
 * Context manager configuration
 */
export interface ContextManagerConfig {
  /** Enable context management features */
  enabled: boolean;
  /** Staleness detection config */
  staleness: Partial<StaleDetectorConfig>;
  /** Budget calculation config */
  budget: Partial<BudgetCalculatorConfig>;
  /** Priority integration config */
  priority: Partial<PriorityIntegrationConfig>;
  /** Compression config */
  compression: Partial<CompressionManagerConfig>;
}

/**
 * Default context manager configuration
 */
export const DEFAULT_CONTEXT_MANAGER_CONFIG: ContextManagerConfig = {
  enabled: true,
  staleness: {},
  budget: {},
  priority: {},
  compression: {},
};

/**
 * Context management request
 */
export interface ContextRequest {
  entries: ContextEntry[];
  intent?: QueryIntent;
  complexityOverride?: TaskComplexity;
  complexitySignals?: ComplexitySignals;
  queryEmbedding?: number[];
  scopeId?: string;
  format?: 'markdown' | 'json' | 'natural_language';
  maxEntries?: number;
  maxTokens?: number;
}

/**
 * Context management result
 */
export interface ContextResult {
  /** Final formatted context */
  content: string;
  /** Entries included in the context */
  includedEntries: ContextEntry[];
  /** Entries excluded (low priority or dropped) */
  excludedEntries: ContextEntry[];
  /** Staleness warnings */
  stalenessWarnings: StalenessWarning[];
  /** Budget calculation result */
  budget: BudgetResult;
  /** Compression level applied */
  compressionLevel: CompressionLevel;
  /** Processing statistics */
  stats: {
    inputEntryCount: number;
    outputEntryCount: number;
    staleEntryCount: number;
    excludedByPriorityCount: number;
    droppedByCompressionCount: number;
    originalTokens: number;
    finalTokens: number;
    compressionRatio: number;
    processingTimeMs: number;
  };
}

// =============================================================================
// CONTEXT MANAGER SERVICE
// =============================================================================

/**
 * ContextManagerService orchestrates enhanced context injection.
 *
 * Pipeline:
 * 1. Budget Calculation: Determine token budget based on task complexity
 * 2. Staleness Analysis: Identify potentially outdated entries
 * 3. Priority Selection: Rank and filter entries by smart priority
 * 4. Compression: Apply progressive compression to fit budget
 * 5. Formatting: Output final context in requested format
 */
export class ContextManagerService {
  private staleDetector: StaleContextDetector;
  private budgetCalculator: DynamicBudgetCalculator;
  private priorityIntegration: PriorityIntegrationService;
  private compressionManager: CompressionManager;

  constructor(
    prioritizationService: SmartPrioritizationService | null,
    summarizationService: IHierarchicalSummarizationService | null,
    private readonly config: ContextManagerConfig = DEFAULT_CONTEXT_MANAGER_CONFIG
  ) {
    // Initialize sub-components
    this.staleDetector = createStaleContextDetector(config.staleness);
    this.budgetCalculator = createBudgetCalculator(config.budget);
    this.priorityIntegration = createPriorityIntegrationService(
      prioritizationService,
      config.priority
    );
    this.compressionManager = createCompressionManager(summarizationService, config.compression);

    logger.debug({ enabled: config.enabled }, 'Context manager initialized');
  }

  /**
   * Process entries through the full context management pipeline
   *
   * @param request - Context request with entries and options
   * @returns Processed context result
   */
  async process(request: ContextRequest): Promise<ContextResult> {
    const startTime = Date.now();

    // Fast path if disabled
    if (!this.config.enabled) {
      return this.createPassthroughResult(request, startTime);
    }

    const format = request.format ?? 'markdown';

    const derivedComplexity = this.deriveComplexityFromSignals(request);
    const budget = this.budgetCalculator.calculate(
      request.intent,
      derivedComplexity ?? request.complexityOverride
    );
    const targetTokens = request.maxTokens ?? budget.effectiveBudget;

    logger.debug(
      {
        intent: request.intent,
        complexity: budget.complexity,
        targetTokens,
        entryCount: request.entries.length,
      },
      'Starting context processing'
    );

    // Step 2: Analyze staleness
    const stalenessEntries: StalenessEntry[] = request.entries.map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      accessedAt: e.accessedAt,
    }));

    const stalenessResult = this.staleDetector.analyze(stalenessEntries);
    const nonStaleEntries = this.staleDetector.getConfig().excludeFromInjection
      ? request.entries.filter((e) => !stalenessResult.excludedEntries.some((x) => x.id === e.id))
      : request.entries;

    // Step 3: Prioritize entries
    const prioritizableEntries: PrioritizableEntry[] = nonStaleEntries.map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      content: e.content,
      priority: e.priority,
      relevanceScore: e.relevanceScore,
    }));

    const priorityResult = await this.priorityIntegration.prioritize(
      prioritizableEntries,
      request.intent,
      request.queryEmbedding,
      request.scopeId
    );

    // Apply maxEntries limit
    const maxEntries = request.maxEntries ?? this.getTotalMaxEntries(budget);
    const selectedEntries = priorityResult.entries.slice(0, maxEntries);

    // Step 4: Compress if needed
    const compressibleEntries: CompressibleEntry[] = selectedEntries.map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      content: e.content ?? '',
      priority: e.priority,
    }));

    const compressionResult = await this.compressionManager.compress(
      compressibleEntries,
      targetTokens,
      format
    );

    // Build final result
    const includedEntries = compressionResult.includedEntries.map(
      (ce) => request.entries.find((e) => e.id === ce.id)!
    );

    const excludedEntries = [
      // Excluded by staleness
      ...(this.staleDetector.getConfig().excludeFromInjection
        ? stalenessResult.excludedEntries
        : []),
      // Excluded by priority
      ...priorityResult.excluded,
      // Dropped by compression
      ...compressionResult.droppedEntries,
    ]
      .map((ex) => request.entries.find((e) => e.id === ex.id))
      .filter((e): e is ContextEntry => e !== undefined);

    const processingTimeMs = Date.now() - startTime;

    logger.info(
      {
        inputEntries: request.entries.length,
        outputEntries: includedEntries.length,
        staleWarnings: stalenessResult.warnings.length,
        compressionLevel: compressionResult.level,
        finalTokens: compressionResult.compressedTokens,
        processingTimeMs,
      },
      'Context processing complete'
    );

    return {
      content: compressionResult.content,
      includedEntries,
      excludedEntries,
      stalenessWarnings: stalenessResult.warnings,
      budget,
      compressionLevel: compressionResult.level,
      stats: {
        inputEntryCount: request.entries.length,
        outputEntryCount: includedEntries.length,
        staleEntryCount: stalenessResult.stats.staleCount,
        excludedByPriorityCount: priorityResult.stats.totalExcluded,
        droppedByCompressionCount: compressionResult.droppedEntries.length,
        originalTokens: compressionResult.originalTokens,
        finalTokens: compressionResult.compressedTokens,
        compressionRatio: compressionResult.ratio,
        processingTimeMs,
      },
    };
  }

  /**
   * Get budget calculator for direct access
   */
  getBudgetCalculator(): DynamicBudgetCalculator {
    return this.budgetCalculator;
  }

  /**
   * Get stale detector for direct access
   */
  getStaleDetector(): StaleContextDetector {
    return this.staleDetector;
  }

  /**
   * Get priority integration for direct access
   */
  getPriorityIntegration(): PriorityIntegrationService {
    return this.priorityIntegration;
  }

  /**
   * Get compression manager for direct access
   */
  getCompressionManager(): CompressionManager {
    return this.compressionManager;
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<ContextManagerConfig> {
    return { ...this.config };
  }

  private deriveComplexityFromSignals(request: ContextRequest): TaskComplexity | undefined {
    const signals = request.complexitySignals;
    if (!signals) {
      return undefined;
    }

    if (signals.score >= 0.6 || signals.hasErrorRecovery || signals.hasDecisions) {
      return 'complex';
    }

    if (signals.score >= 0.3 || signals.hasLearning) {
      return 'moderate';
    }

    return 'simple';
  }

  private getTotalMaxEntries(budget: BudgetResult): number {
    return (
      budget.maxEntries.guideline +
      budget.maxEntries.knowledge +
      budget.maxEntries.tool +
      budget.maxEntries.experience
    );
  }

  /**
   * Create passthrough result when disabled
   */
  private createPassthroughResult(request: ContextRequest, startTime: number): ContextResult {
    const format = request.format ?? 'markdown';
    const content = this.formatEntriesSimple(request.entries, format);
    const tokens = this.compressionManager.estimateTokens(content);

    return {
      content,
      includedEntries: request.entries,
      excludedEntries: [],
      stalenessWarnings: [],
      budget: this.budgetCalculator.calculate(request.intent),
      compressionLevel: 'none',
      stats: {
        inputEntryCount: request.entries.length,
        outputEntryCount: request.entries.length,
        staleEntryCount: 0,
        excludedByPriorityCount: 0,
        droppedByCompressionCount: 0,
        originalTokens: tokens,
        finalTokens: tokens,
        compressionRatio: 1.0,
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Simple formatting for passthrough mode
   */
  private formatEntriesSimple(
    entries: ContextEntry[],
    format: 'markdown' | 'json' | 'natural_language'
  ): string {
    if (format === 'json') {
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

    const parts: string[] = [];
    for (const entry of entries) {
      if (format === 'markdown') {
        parts.push(
          `- **${entry.title ?? entry.type}**: ${entry.content.slice(0, 200)}${entry.content.length > 200 ? '...' : ''}`
        );
      } else {
        parts.push(`- ${entry.title ?? entry.type}: ${entry.content.slice(0, 150)}`);
      }
    }

    return parts.join('\n');
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a ContextManagerService
 *
 * @param prioritizationService - SmartPrioritizationService for priority-based selection
 * @param summarizationService - HierarchicalSummarizationService for LLM compression
 * @param config - Configuration options
 * @returns Configured ContextManagerService
 */
export function createContextManagerService(
  prioritizationService: SmartPrioritizationService | null,
  summarizationService: IHierarchicalSummarizationService | null,
  config?: Partial<ContextManagerConfig>
): ContextManagerService {
  const mergedConfig: ContextManagerConfig = {
    ...DEFAULT_CONTEXT_MANAGER_CONFIG,
    ...config,
  };

  return new ContextManagerService(prioritizationService, summarizationService, mergedConfig);
}
