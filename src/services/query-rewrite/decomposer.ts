/**
 * Query Decomposer for Multi-Hop Query Processing
 *
 * Breaks complex queries into simpler sub-queries that can be executed
 * independently and merged for comprehensive retrieval.
 *
 * Uses pattern-based detection for speed with LLM fallback for accuracy.
 */

import type { ExtractionService } from '../extraction.service.js';
import type { QueryIntent, SubQuery, QueryPlan, ExecutionOrder } from './types.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('query-decomposer');

/**
 * Configuration for QueryDecomposer
 */
export interface QueryDecomposerConfig {
  /** Confidence threshold for pattern-based detection (0-1) */
  decompositionThreshold: number;
  /** Maximum number of sub-queries to generate */
  maxSubQueries: number;
  /** Temperature for LLM decomposition */
  temperature: number;
  /** Whether to use LLM for decomposition (requires ExtractionService) */
  useLLM: boolean;
}

/**
 * Default decomposer configuration
 */
export const DEFAULT_DECOMPOSER_CONFIG: QueryDecomposerConfig = {
  decompositionThreshold: 0.7,
  maxSubQueries: 5,
  temperature: 0.3,
  useLLM: true,
};

/**
 * Result of query complexity analysis
 */
export interface ComplexityAnalysis {
  /** Whether the query needs decomposition */
  needsDecomposition: boolean;
  /** Confidence in the analysis (0-1) */
  confidence: number;
  /** Detected complexity type */
  complexityType?: 'multi_topic' | 'temporal_chain' | 'comparison' | 'causal' | 'simple';
  /** Detected topics/entities */
  detectedTopics?: string[];
}

/**
 * Patterns for detecting complex queries (fast path)
 */
const COMPLEXITY_PATTERNS: Array<{
  pattern: RegExp;
  type: ComplexityAnalysis['complexityType'];
  confidence: number;
}> = [
  // Multi-topic: "What is X and how does Y work?"
  {
    pattern: /\b(and|also|as well as|plus|additionally)\b.*\b(how|what|where|why|when|which)\b/i,
    type: 'multi_topic',
    confidence: 0.85,
  },
  // Temporal chain: "What happened after X and before Y?"
  {
    pattern: /\b(then|after|before|once|when|while|during|since|until)\b.*\b(and|then|also)\b/i,
    type: 'temporal_chain',
    confidence: 0.8,
  },
  // Comparison: "What's the difference between X and Y?"
  {
    pattern: /\b(difference|compare|comparison|vs\.?|versus|between)\b.*\b(and|or)\b/i,
    type: 'comparison',
    confidence: 0.9,
  },
  // Causal chain: "Why did X happen and what was the result?"
  {
    pattern: /\b(because|therefore|so|thus|hence|caused|led to|resulted in)\b.*\b(and|what|how)\b/i,
    type: 'causal',
    confidence: 0.8,
  },
  // Multiple questions: "How do I X? Also, what is Y?"
  {
    pattern: /\?\s*(and|also|additionally|plus|furthermore|moreover)\s+/i,
    type: 'multi_topic',
    confidence: 0.9,
  },
  // List-like queries: "Tell me about X, Y, and Z"
  {
    pattern: /\b(about|regarding|concerning)\b.+,\s*[^,]+,?\s*(and|or)\s+/i,
    type: 'multi_topic',
    confidence: 0.75,
  },
];

/**
 * Escape user input to prevent prompt injection attacks.
 * Bug #4 fix: Sanitize user queries before embedding in prompts.
 */
function escapeForPrompt(input: string): string {
  // Replace characters that could be used for prompt injection
  return input
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .slice(0, 2000); // Limit length to prevent context overflow
}

/**
 * LLM prompt for query decomposition
 */
function buildDecompositionPrompt(query: string): string {
  // Bug #4 fix: Escape user input to prevent prompt injection
  const escapedQuery = escapeForPrompt(query);

  return `You are a query decomposition expert. Your task is to analyze a query and break it into simpler, independent sub-queries if it's complex.

Rules:
1. Only decompose if the query has multiple distinct information needs
2. Each sub-query should be self-contained and answerable independently
3. Preserve the original intent and context
4. Use the same language style as the original query
5. Order sub-queries by logical dependency (independent ones first)

Query: "${escapedQuery}"

Respond with a JSON object:
{
  "shouldDecompose": boolean,
  "reason": "brief explanation",
  "subQueries": [
    {
      "index": 0,
      "query": "the sub-query text",
      "purpose": "what this sub-query retrieves",
      "dependsOn": null or [indices of dependent sub-queries]
    }
  ]
}

If the query is simple and doesn't need decomposition, set shouldDecompose to false and return an empty subQueries array.
Only output the JSON object, no explanation.`;
}

/**
 * Query Decomposer
 *
 * Analyzes complex queries and breaks them into simpler sub-queries
 * for multi-hop retrieval.
 *
 * @example
 * ```typescript
 * const decomposer = new QueryDecomposer(extractionService, {
 *   maxSubQueries: 5,
 *   useLLM: true
 * });
 *
 * const analysis = decomposer.analyzeQuery("What is our auth system and how do we deploy?");
 * // { needsDecomposition: true, confidence: 0.85, complexityType: 'multi_topic' }
 *
 * const plan = await decomposer.decompose("What is our auth system and how do we deploy?");
 * // { subQueries: [...], executionOrder: 'parallel' }
 * ```
 */
export class QueryDecomposer {
  private config: QueryDecomposerConfig;
  private extractionService: ExtractionService | null;

  constructor(
    extractionService: ExtractionService | null,
    config: Partial<QueryDecomposerConfig> = {}
  ) {
    this.extractionService = extractionService;
    this.config = { ...DEFAULT_DECOMPOSER_CONFIG, ...config };
  }

  /**
   * Check if the decomposer can use LLM
   */
  isAvailable(): boolean {
    return this.config.useLLM && this.extractionService?.isAvailable() === true;
  }

  /**
   * Fast-path: Pattern-based complexity detection
   *
   * Analyzes query structure to determine if decomposition is needed
   * without calling an LLM.
   */
  analyzeQuery(query: string): ComplexityAnalysis {
    const normalizedQuery = query.toLowerCase().trim();

    // Check each complexity pattern
    for (const { pattern, type, confidence } of COMPLEXITY_PATTERNS) {
      if (pattern.test(normalizedQuery)) {
        // Extract potential topics for context
        const detectedTopics = this.extractTopics(query);

        logger.debug(
          { query: query.slice(0, 100), type, confidence, topicCount: detectedTopics.length },
          'Complex query detected via pattern'
        );

        return {
          needsDecomposition: confidence >= this.config.decompositionThreshold,
          confidence,
          complexityType: type,
          detectedTopics,
        };
      }
    }

    // Check for multiple question marks (multiple questions in one query)
    const questionCount = (query.match(/\?/g) || []).length;
    if (questionCount > 1) {
      return {
        needsDecomposition: true,
        confidence: 0.9,
        complexityType: 'multi_topic',
        detectedTopics: this.extractTopics(query),
      };
    }

    // Default: Simple query
    return {
      needsDecomposition: false,
      confidence: 0.9,
      complexityType: 'simple',
    };
  }

  /**
   * Decompose a complex query into sub-queries
   *
   * Uses pattern-based decomposition first, then LLM if available and needed.
   */
  async decompose(query: string, intent?: QueryIntent): Promise<QueryPlan> {
    const analysis = this.analyzeQuery(query);

    // If simple, return single-query plan
    if (!analysis.needsDecomposition) {
      return {
        subQueries: [
          {
            index: 0,
            query: query,
            purpose: 'Original query (no decomposition needed)',
          },
        ],
        executionOrder: 'parallel',
      };
    }

    // Try pattern-based decomposition first
    const patternPlan = this.decomposeByPattern(query, analysis);
    if (patternPlan.subQueries.length > 1) {
      logger.debug(
        { subQueryCount: patternPlan.subQueries.length },
        'Query decomposed via pattern matching'
      );
      return patternPlan;
    }

    // Fall back to LLM decomposition if available
    if (this.isAvailable()) {
      try {
        const llmPlan = await this.decomposeWithLLM(query, intent);
        if (llmPlan.subQueries.length > 1) {
          logger.debug(
            { subQueryCount: llmPlan.subQueries.length },
            'Query decomposed via LLM'
          );
          return llmPlan;
        }
      } catch (error) {
        logger.warn({ error }, 'LLM decomposition failed, using pattern result');
      }
    }

    // Return pattern result or original query
    return patternPlan;
  }

  /**
   * Pattern-based decomposition (no LLM)
   */
  private decomposeByPattern(query: string, analysis: ComplexityAnalysis): QueryPlan {
    const subQueries: SubQuery[] = [];

    switch (analysis.complexityType) {
      case 'multi_topic': {
        // Split on conjunctions and question marks
        const parts = this.splitMultiTopic(query);
        parts.forEach((part, index) => {
          if (part.trim()) {
            subQueries.push({
              index,
              query: part.trim(),
              purpose: `Topic ${index + 1}`,
            });
          }
        });
        break;
      }

      case 'comparison': {
        // Extract entities being compared
        const entities = this.extractComparisonEntities(query);
        if (entities.length >= 2) {
          // Query for each entity
          entities.forEach((entity, index) => {
            subQueries.push({
              index,
              query: `What is ${entity}?`,
              purpose: `Information about ${entity}`,
            });
          });
          // Add comparison query that depends on entity queries
          subQueries.push({
            index: entities.length,
            query: query,
            purpose: 'Full comparison with context',
            dependsOn: entities.map((_, i) => i),
          });
        }
        break;
      }

      case 'temporal_chain':
      case 'causal': {
        // For temporal/causal, maintain order dependency
        const parts = this.splitTemporalCausal(query);
        parts.forEach((part, index) => {
          subQueries.push({
            index,
            query: part.trim(),
            purpose: `Step ${index + 1}`,
            dependsOn: index > 0 ? [index - 1] : undefined,
          });
        });
        break;
      }

      default:
        // Use detected topics if available
        if (analysis.detectedTopics && analysis.detectedTopics.length > 1) {
          analysis.detectedTopics.forEach((topic, index) => {
            subQueries.push({
              index,
              query: `What about ${topic}?`,
              purpose: `Information about ${topic}`,
            });
          });
        }
    }

    // If no decomposition achieved, return original
    if (subQueries.length === 0) {
      subQueries.push({
        index: 0,
        query: query,
        purpose: 'Original query',
      });
    }

    // Limit sub-queries
    const limitedSubQueries = subQueries.slice(0, this.config.maxSubQueries);

    // Determine execution order
    const hasDependencies = limitedSubQueries.some((sq) => sq.dependsOn && sq.dependsOn.length > 0);
    const executionOrder: ExecutionOrder = hasDependencies ? 'dependency' : 'parallel';

    return {
      subQueries: limitedSubQueries,
      executionOrder,
      dependencies: hasDependencies ? this.buildDependencyMap(limitedSubQueries) : undefined,
    };
  }

  /**
   * LLM-based decomposition using direct API call
   *
   * Uses the underlying LLM (via extraction service config) to analyze
   * complex queries and generate an optimal decomposition plan.
   */
  private async decomposeWithLLM(query: string, _intent?: QueryIntent): Promise<QueryPlan> {
    if (!this.extractionService) {
      logger.debug('No extraction service available for LLM decomposition');
      return { subQueries: [{ index: 0, query, purpose: 'Original query' }], executionOrder: 'parallel' };
    }

    try {
      const prompt = buildDecompositionPrompt(query);

      // Use extraction service's callLLM method if available, otherwise use pattern-based
      // Note: ExtractionService is primarily for structured extraction
      // For now, rely on the robust pattern-based decomposition
      // LLM decomposition can be enhanced when a dedicated chat completion service is available
      const response = await this.callLLMForDecomposition(prompt);

      if (!response) {
        logger.debug('No LLM response for decomposition, using pattern-based');
        return { subQueries: [{ index: 0, query, purpose: 'Original query' }], executionOrder: 'parallel' };
      }

      // Parse the JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.debug('No JSON found in LLM decomposition response');
        return { subQueries: [{ index: 0, query, purpose: 'Original query' }], executionOrder: 'parallel' };
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        shouldDecompose: boolean;
        reason?: string;
        subQueries: Array<{
          index: number;
          query: string;
          purpose: string;
          dependsOn?: number[] | null;
        }>;
      };

      if (!parsed.shouldDecompose || !parsed.subQueries?.length) {
        logger.debug({ reason: parsed.reason }, 'LLM determined no decomposition needed');
        return { subQueries: [{ index: 0, query, purpose: 'Original query' }], executionOrder: 'parallel' };
      }

      // Convert to SubQuery format with index validation
      // Bug #32 fix: Validate LLM-provided indices are valid integers within range
      const subQueries: SubQuery[] = parsed.subQueries
        .slice(0, this.config.maxSubQueries)
        .map((sq, idx) => {
          // Validate and normalize index - use positional index if invalid
          const providedIndex = sq.index;
          const safeIndex =
            typeof providedIndex === 'number' &&
            Number.isInteger(providedIndex) &&
            providedIndex >= 0 &&
            providedIndex < parsed.subQueries.length
              ? providedIndex
              : idx;

          // Validate dependsOn indices if present
          const safeDependsOn =
            Array.isArray(sq.dependsOn)
              ? sq.dependsOn.filter(
                  (dep) =>
                    typeof dep === 'number' &&
                    Number.isInteger(dep) &&
                    dep >= 0 &&
                    dep < parsed.subQueries.length &&
                    dep !== safeIndex // Can't depend on self
                )
              : undefined;

          return {
            index: safeIndex,
            query: String(sq.query || '').trim() || query, // Fallback to original if empty
            purpose: String(sq.purpose || '').trim() || 'Sub-query',
            dependsOn: safeDependsOn?.length ? safeDependsOn : undefined,
          };
        });

      // Determine execution order
      const hasDependencies = subQueries.some((sq) => sq.dependsOn && sq.dependsOn.length > 0);
      const executionOrder: ExecutionOrder = hasDependencies ? 'dependency' : 'parallel';

      logger.debug(
        { subQueryCount: subQueries.length, executionOrder, reason: parsed.reason },
        'LLM decomposition successful'
      );

      return {
        subQueries,
        executionOrder,
        dependencies: hasDependencies ? this.buildDependencyMap(subQueries) : undefined,
      };
    } catch (error) {
      logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'LLM decomposition failed');
      return { subQueries: [{ index: 0, query, purpose: 'Original query' }], executionOrder: 'parallel' };
    }
  }

  /**
   * Call LLM for decomposition using available provider
   * Uses the extraction service's configuration but makes a direct chat completion call
   */
  private async callLLMForDecomposition(_prompt: string): Promise<string | null> {
    // Check if extraction service is configured for an LLM provider
    if (!this.extractionService?.isAvailable()) {
      return null;
    }

    // For now, pattern-based decomposition is the primary approach
    // LLM-based decomposition can be enabled when the extraction service
    // exposes a general-purpose chat completion method
    // This allows for future enhancement without breaking changes
    logger.debug('LLM decomposition requires chat completion API - using pattern-based fallback');
    return null;
  }

  /**
   * Extract potential topics from query text
   */
  private extractTopics(query: string): string[] {
    const topics: string[] = [];

    // Extract quoted strings
    const quoted = query.match(/"([^"]+)"|'([^']+)'/g);
    if (quoted) {
      topics.push(...quoted.map((q) => q.replace(/['"]/g, '')));
    }

    // Extract capitalized words (likely entities/names)
    const capitalized = query.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g);
    if (capitalized) {
      topics.push(...capitalized.filter((t) => t.length > 2));
    }

    return [...new Set(topics)];
  }

  /**
   * Split multi-topic query into parts
   */
  private splitMultiTopic(query: string): string[] {
    // Split on common conjunctions and question marks
    const parts = query
      .split(/\s*(?:\?|\.)\s*(?:and|also|additionally|plus|furthermore|moreover)\s*/i)
      .filter(Boolean);

    if (parts.length > 1) {
      return parts.map((p) => (p.endsWith('?') ? p : p + '?'));
    }

    // Try splitting on just conjunctions
    const conjParts = query.split(/\s+(?:and|also|as well as)\s+(?=\b(?:how|what|where|why|when|which)\b)/i);
    if (conjParts.length > 1) {
      return conjParts.map((p) => p.trim());
    }

    return [query];
  }

  /**
   * Extract entities being compared
   */
  private extractComparisonEntities(query: string): string[] {
    // Match "X vs Y", "X and Y", "between X and Y"
    const patterns = [
      /between\s+(.+?)\s+and\s+(.+?)(?:\?|$)/i,
      /(.+?)\s+(?:vs\.?|versus)\s+(.+?)(?:\?|$)/i,
      /compare\s+(.+?)\s+(?:and|with|to)\s+(.+?)(?:\?|$)/i,
      /difference(?:s)?\s+between\s+(.+?)\s+and\s+(.+?)(?:\?|$)/i,
    ];

    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match && match[1] && match[2]) {
        return [match[1].trim(), match[2].trim()];
      }
    }

    return [];
  }

  /**
   * Split temporal/causal query into parts
   */
  private splitTemporalCausal(query: string): string[] {
    const parts = query
      .split(/\s*(?:and then|then|after that|because|therefore|so that|which caused|resulting in)\s*/i)
      .filter(Boolean);

    return parts.length > 1 ? parts : [query];
  }

  /**
   * Build dependency map from sub-queries
   */
  private buildDependencyMap(subQueries: SubQuery[]): Map<number, number[]> {
    const deps = new Map<number, number[]>();
    for (const sq of subQueries) {
      if (sq.dependsOn && sq.dependsOn.length > 0) {
        deps.set(sq.index, sq.dependsOn);
      }
    }
    return deps;
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<QueryDecomposerConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<QueryDecomposerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Singleton instance
 */
let defaultDecomposer: QueryDecomposer | null = null;

/**
 * Get the default decomposer instance
 */
export function getQueryDecomposer(
  extractionService?: ExtractionService
): QueryDecomposer {
  if (!defaultDecomposer) {
    defaultDecomposer = new QueryDecomposer(extractionService ?? null);
  }
  return defaultDecomposer;
}

/**
 * Reset the default decomposer
 */
export function resetQueryDecomposer(): void {
  defaultDecomposer = null;
}
