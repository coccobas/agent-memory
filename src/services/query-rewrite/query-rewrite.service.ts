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
import { HyDEGenerator } from './hyde.js';
import { QueryDecomposer, type QueryDecomposerConfig } from './decomposer.js';
import type {
  IQueryRewriteService,
  RewriteInput,
  RewriteResult,
  RewrittenQuery,
  RewriteStrategy,
  ClassificationResult,
  ExpansionConfig,
  HyDEConfig,
  QueryPlan,
} from './types.js';
import type { ExtractionService } from '../extraction.service.js';
import type { EmbeddingService } from '../embedding.service.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('query-rewrite');

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
  /** Enable multi-hop query decomposition */
  enableDecomposition?: boolean;
  /** HyDE configuration (required when enableHyDE is true) */
  hyde?: HyDEConfig;
  /** Decomposition configuration */
  decomposition?: Partial<QueryDecomposerConfig>;
}

/**
 * Extended rewrite result with decomposition plan
 */
export interface ExtendedRewriteResult extends RewriteResult {
  /** Query decomposition plan (when strategy is 'multi_hop') */
  decompositionPlan?: QueryPlan;
}

/**
 * Dependencies for QueryRewriteService (for HyDE)
 */
export interface QueryRewriteServiceDeps {
  /** Extraction service for HyDE document generation */
  extractionService?: ExtractionService;
  /** Embedding service for HyDE embeddings */
  embeddingService?: EmbeddingService;
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
  private hydeGenerator: HyDEGenerator | null = null;
  private decomposer: QueryDecomposer | null = null;
  private config: QueryRewriteServiceConfig;

  /**
   * Creates a new QueryRewriteService
   *
   * @param config - Service configuration
   * @param deps - Optional dependencies for HyDE (extraction and embedding services)
   */
  constructor(config: QueryRewriteServiceConfig = {}, deps?: QueryRewriteServiceDeps) {
    this.config = {
      enableExpansion: config.enableExpansion ?? true,
      enableHyDE: config.enableHyDE ?? false,
      enableDecomposition: config.enableDecomposition ?? false,
      expansion: {
        ...DEFAULT_EXPANSION_CONFIG,
        ...config.expansion,
      },
      hyde: config.hyde,
      decomposition: config.decomposition,
    };

    // Always create classifier (lightweight)
    this.classifier = new IntentClassifier();

    // Create expander if expansion is enabled
    if (this.config.enableExpansion && this.config.expansion) {
      this.expander = new QueryExpander(this.config.expansion);
    }

    // Create HyDE generator if enabled and dependencies are available
    if (
      this.config.enableHyDE &&
      deps?.extractionService &&
      deps?.embeddingService &&
      config.hyde
    ) {
      this.hydeGenerator = new HyDEGenerator(
        deps.extractionService,
        deps.embeddingService,
        config.hyde
      );
    }

    // Create decomposer if enabled
    if (this.config.enableDecomposition) {
      this.decomposer = new QueryDecomposer(
        deps?.extractionService ?? null,
        this.config.decomposition
      );
    }
  }

  /**
   * Rewrite a query using configured strategies
   *
   * Always includes the original query with weight 1.0.
   * Determines strategy based on enabled options and combines results.
   *
   * @param input - Rewrite input with query and options
   * @returns Rewrite result with all query variations (and decomposition plan if applicable)
   */
  async rewrite(input: RewriteInput): Promise<ExtendedRewriteResult> {
    const startTime = Date.now();
    const queries: RewrittenQuery[] = [];

    // Step 1: Classify intent (or use provided intent)
    const classification =
      input.queryType != null
        ? { intent: input.queryType, confidence: 1.0, method: 'provided' as const }
        : await this.classifier.classifyAsync(input.originalQuery);

    // Step 2: Check for decomposition (before adding original query)
    const opts = input.options ?? {};
    const enableDecomposition =
      opts.enableDecomposition ?? this.config.enableDecomposition ?? false;
    let decompositionPlan: QueryPlan | undefined;

    if (enableDecomposition && this.decomposer) {
      const analysis = this.decomposer.analyzeQuery(input.originalQuery);

      if (analysis.needsDecomposition) {
        try {
          decompositionPlan = await this.decomposer.decompose(
            input.originalQuery,
            classification.intent
          );

          // Add sub-queries as rewritten queries
          for (const subQuery of decompositionPlan.subQueries) {
            queries.push({
              text: subQuery.query,
              source: 'decomposition',
              weight: 0.95, // High weight for decomposed queries
              subQueryIndex: subQuery.index,
            });
          }

          logger.debug(
            {
              query: input.originalQuery.slice(0, 50),
              subQueryCount: decompositionPlan.subQueries.length,
              executionOrder: decompositionPlan.executionOrder,
            },
            'Query decomposed into sub-queries'
          );
        } catch (error) {
          logger.warn({ error }, 'Query decomposition failed, using original query');
        }
      }
    }

    // Step 3: Always include original query with weight 1.0 (if not decomposed, or as fallback)
    if (!decompositionPlan || decompositionPlan.subQueries.length === 0) {
      queries.push({
        text: input.originalQuery,
        source: 'original',
        weight: 1.0,
      });
    }

    // Step 4: Apply other enabled strategies
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

    // HyDE strategy - generate hypothetical documents and embed them
    if (enableHyDE && this.hydeGenerator && this.hydeGenerator.isAvailable()) {
      const hydeResult = await this.hydeGenerator.generate(
        input.originalQuery,
        classification.intent
      );

      // Add each HyDE document as a rewritten query with its embedding
      for (let i = 0; i < hydeResult.documents.length; i++) {
        const doc = hydeResult.documents[i];
        const embedding = hydeResult.embeddings[i];

        if (doc && embedding) {
          queries.push({
            text: doc,
            embedding, // Pre-computed embedding for semantic search
            source: 'hyde',
            weight: 0.9, // HyDE documents get high weight (but less than original)
          });
        }
      }
    }

    // Step 5: Determine strategy
    const strategy = this.determineStrategy(enableHyDE, enableExpansion, decompositionPlan);

    // Step 6: Sort by weight descending (original first if tied)
    const sortedQueries = this.sortQueries(queries);

    // Step 7: Calculate processing time
    const processingTimeMs = Date.now() - startTime;

    return {
      rewrittenQueries: sortedQueries,
      intent: classification.intent,
      strategy,
      processingTimeMs,
      decompositionPlan,
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
      this.config.enableDecomposition === true ||
      this.expander != null ||
      this.hydeGenerator != null ||
      this.decomposer != null
    );
  }

  /**
   * Check if decomposition is available
   *
   * @returns True if decomposer is initialized
   */
  isDecompositionAvailable(): boolean {
    return this.decomposer != null;
  }

  /**
   * Determine rewrite strategy based on enabled options
   *
   * @param enableHyDE - Whether HyDE is enabled
   * @param enableExpansion - Whether expansion is enabled
   * @param decompositionPlan - Decomposition plan if decomposition was used
   * @returns The strategy being used
   */
  private determineStrategy(
    enableHyDE: boolean,
    enableExpansion: boolean,
    decompositionPlan?: QueryPlan
  ): RewriteStrategy {
    // Multi-hop takes precedence if decomposition occurred
    if (decompositionPlan && decompositionPlan.subQueries.length > 1) {
      return 'multi_hop';
    }
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
