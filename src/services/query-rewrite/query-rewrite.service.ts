/**
 * Query Rewrite Service
 *
 * Orchestrates all query rewriting components:
 * - Intent classification for query understanding
 * - Query expansion with synonyms and relations
 * - HyDE (Hypothetical Document Embedding) generation
 *
 * Combines results from enabled strategies to improve retrieval quality.
 */

import { IntentClassifier } from './classifier.js';
import { QueryExpander } from './expander.js';
import type {
  IQueryRewriteService,
  RewriteInput,
  RewriteResult,
  RewrittenQuery,
  RewriteStrategy,
  ClassificationResult,
  ExpansionConfig,
} from './types.js';

/**
 * Configuration for QueryRewriteService
 */
export interface QueryRewriteServiceConfig {
  /** Expansion configuration */
  expansion?: ExpansionConfig;
  /** Enable HyDE by default */
  enableHyDE?: boolean;
  /** Enable expansion by default */
  enableExpansion?: boolean;
}

/**
 * Default expansion configuration
 */
const DEFAULT_EXPANSION_CONFIG: ExpansionConfig = {
  useDictionary: true,
  useRelations: false, // Relations require graph traverser
  useLLM: false, // LLM expansion not yet implemented
  maxExpansions: 5,
  expansionWeight: 0.7,
};

/**
 * Query Rewrite Service
 *
 * Orchestrates intent classification, query expansion, and HyDE generation
 * to produce multiple query variations that improve retrieval recall and precision.
 *
 * @todo Implement HyDE (Hypothetical Document Embedding) generator.
 *       HyDE uses an LLM to generate hypothetical answer documents,
 *       then embeds those for retrieval instead of the raw query.
 *
 * @example
 * ```typescript
 * const service = new QueryRewriteService({
 *   enableExpansion: true,
 *   expansion: {
 *     useDictionary: true,
 *     maxExpansions: 5
 *   }
 * });
 *
 * const result = await service.rewrite({
 *   originalQuery: "how to configure database",
 *   options: { enableExpansion: true }
 * });
 *
 * // result.rewrittenQueries contains:
 * // - Original: "how to configure database"
 * // - Expanded: "how to setup database", "how to configure db", etc.
 * ```
 */
export class QueryRewriteService implements IQueryRewriteService {
  private classifier: IntentClassifier;
  private expander: QueryExpander | null = null;
  private hydeGenerator: unknown | null = null; // Will be typed when HyDE is implemented
  private config: QueryRewriteServiceConfig;

  /**
   * Creates a new QueryRewriteService
   *
   * @param config - Service configuration
   */
  constructor(config: QueryRewriteServiceConfig = {}) {
    this.config = {
      enableExpansion: config.enableExpansion ?? true,
      enableHyDE: config.enableHyDE ?? false,
      expansion: {
        ...DEFAULT_EXPANSION_CONFIG,
        ...config.expansion,
      },
    };

    // Always create classifier (lightweight)
    this.classifier = new IntentClassifier();

    // Create expander if expansion is enabled
    if (this.config.enableExpansion) {
      this.expander = new QueryExpander(this.config.expansion!);
    }

    // HyDE generator initialization (not yet implemented - see class @todo)
  }

  /**
   * Rewrite a query using configured strategies
   *
   * Always includes the original query with weight 1.0.
   * Determines strategy based on enabled options and combines results.
   *
   * @param input - Rewrite input with query and options
   * @returns Rewrite result with all query variations
   */
  async rewrite(input: RewriteInput): Promise<RewriteResult> {
    const startTime = Date.now();
    const queries: RewrittenQuery[] = [];

    // Step 1: Classify intent (or use provided intent)
    const classification =
      input.queryType != null
        ? { intent: input.queryType, confidence: 1.0, method: 'provided' as const }
        : await this.classifier.classifyAsync(input.originalQuery);

    // Step 2: Always include original query with weight 1.0
    queries.push({
      text: input.originalQuery,
      source: 'original',
      weight: 1.0,
    });

    // Step 3: Apply enabled strategies
    const opts = input.options ?? {};
    const enableExpansion = opts.enableExpansion ?? this.config.enableExpansion ?? false;
    const enableHyDE = opts.enableHyDE ?? this.config.enableHyDE ?? false;

    // Expansion strategy
    if (enableExpansion && this.expander) {
      const expansions = await this.expander.expand(input.originalQuery);

      // Convert to RewrittenQuery format
      const expansionWeight = this.config.expansion?.expansionWeight ?? 0.7;
      const maxExpansions = opts.maxExpansions ?? this.config.expansion?.maxExpansions ?? 5;

      for (const expansion of expansions.slice(0, maxExpansions)) {
        queries.push({
          text: expansion.text,
          source: 'expansion',
          weight: expansion.confidence * expansionWeight,
        });
      }
    }

    // HyDE strategy (not yet implemented - see class @todo)
    if (enableHyDE && this.hydeGenerator) {
      // HyDE document generation will be added here
    }

    // Step 4: Determine strategy
    const strategy = this.determineStrategy(enableHyDE, enableExpansion);

    // Step 5: Sort by weight descending (original first if tied)
    const sortedQueries = this.sortQueries(queries);

    // Step 6: Calculate processing time
    const processingTimeMs = Date.now() - startTime;

    return {
      rewrittenQueries: sortedQueries,
      intent: classification.intent,
      strategy,
      processingTimeMs,
    };
  }

  /**
   * Classify query intent
   *
   * @param query - Query text to classify
   * @returns Classification result with intent and confidence
   */
  async classifyIntent(query: string): Promise<ClassificationResult> {
    return this.classifier.classifyAsync(query);
  }

  /**
   * Check if rewriting is available
   *
   * Returns true if at least one rewriting strategy is enabled.
   *
   * @returns True if service is available
   */
  isAvailable(): boolean {
    return (
      this.config.enableExpansion === true ||
      this.config.enableHyDE === true ||
      this.expander != null ||
      this.hydeGenerator != null
    );
  }

  /**
   * Determine rewrite strategy based on enabled options
   *
   * @param enableHyDE - Whether HyDE is enabled
   * @param enableExpansion - Whether expansion is enabled
   * @returns The strategy being used
   */
  private determineStrategy(enableHyDE: boolean, enableExpansion: boolean): RewriteStrategy {
    if (enableHyDE && enableExpansion) {
      return 'hybrid';
    }
    if (enableHyDE) {
      return 'hyde';
    }
    if (enableExpansion) {
      return 'expansion';
    }
    return 'direct';
  }

  /**
   * Sort queries by weight descending
   *
   * Original query is always first if tied on weight.
   *
   * @param queries - Queries to sort
   * @returns Sorted queries
   */
  private sortQueries(queries: RewrittenQuery[]): RewrittenQuery[] {
    return queries.sort((a, b) => {
      // Sort by weight descending
      if (a.weight !== b.weight) {
        return b.weight - a.weight;
      }

      // If tied, original comes first
      if (a.source === 'original') return -1;
      if (b.source === 'original') return 1;

      // Otherwise maintain order
      return 0;
    });
  }

  /**
   * Get current configuration
   *
   * @returns Current service configuration
   */
  getConfig(): Readonly<QueryRewriteServiceConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   *
   * Note: This recreates internal components if needed.
   *
   * @param config - New configuration (partial update)
   */
  updateConfig(config: Partial<QueryRewriteServiceConfig>): void {
    // Merge expansion config ensuring all required fields are present
    const mergedExpansion: ExpansionConfig = {
      ...DEFAULT_EXPANSION_CONFIG,
      ...this.config.expansion,
      ...config.expansion,
    };

    // Merge configs
    this.config = {
      ...this.config,
      ...config,
      expansion: mergedExpansion,
    };

    // Recreate expander if expansion config changed
    if (config.expansion != null || config.enableExpansion != null) {
      if (this.config.enableExpansion && this.config.expansion) {
        this.expander = new QueryExpander(this.config.expansion);
      } else {
        this.expander = null;
      }
    }

    // HyDE generator update will be added here when implemented
  }
}

/**
 * Singleton instance for common use
 */
let defaultService: QueryRewriteService | null = null;

/**
 * Get the default query rewrite service instance
 *
 * Creates a service with default configuration on first call.
 *
 * @returns Default service instance
 */
export function getQueryRewriteService(): QueryRewriteService {
  if (!defaultService) {
    defaultService = new QueryRewriteService();
  }
  return defaultService;
}

/**
 * Reset the default service instance
 *
 * Useful for testing or reconfiguration.
 */
export function resetQueryRewriteService(): void {
  defaultService = null;
}
