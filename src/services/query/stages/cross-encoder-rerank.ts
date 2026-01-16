/**
 * LLM-Based Cross-Encoder Re-ranking Stage
 *
 * Uses an LLM to jointly score query-document pairs for more accurate
 * relevance scoring than bi-encoder approaches.
 *
 * ## Why Cross-Encoder?
 *
 * Bi-encoders (like the existing rerank stage) encode query and documents
 * separately, then compute similarity. Cross-encoders see both together,
 * enabling:
 * - Better understanding of subtle semantic relationships
 * - More accurate partial match detection
 * - Reasoning about document relevance to the query
 *
 * ## Trade-offs
 *
 * - More accurate than bi-encoder
 * - Slower (requires LLM call per document)
 * - Best used on a small candidate set (top-K from initial retrieval)
 *
 * ## Algorithm
 *
 * 1. Take top-N candidates from initial scoring (default 15)
 * 2. Build query-document pairs
 * 3. Batch prompt LLM to score relevance (0-10)
 * 4. Normalize scores and blend with original
 * 5. Re-sort by final score
 */

import type { PipelineContext, QueryResultItem } from '../pipeline.js';

/**
 * Cross-encoder configuration
 */
export interface CrossEncoderConfig {
  /** Enable cross-encoder re-ranking */
  enabled: boolean;
  /** Number of top candidates to re-rank */
  topK: number;
  /** Blend factor: 1.0 = pure cross-encoder, 0.0 = pure original score */
  alpha: number;
  /** Temperature for LLM scoring (lower = more deterministic) */
  temperature: number;
  /** Timeout for LLM call in milliseconds */
  timeoutMs: number;
  /** Maximum concurrent scoring requests */
  concurrency: number;
}

/**
 * Default cross-encoder configuration
 */
export const DEFAULT_CROSS_ENCODER_CONFIG: CrossEncoderConfig = {
  enabled: false,
  topK: 15,
  alpha: 0.6,
  temperature: 0.1,
  timeoutMs: 30000,
  concurrency: 5,
};

/**
 * LLM service interface for cross-encoder scoring
 */
export interface CrossEncoderLLMService {
  /** Score a batch of query-document pairs, returning scores 0-1 */
  scoreRelevance: (
    query: string,
    documents: Array<{ id: string; text: string }>
  ) => Promise<Array<{ id: string; score: number }>>;
  /** Check if LLM service is available */
  isAvailable: () => boolean;
}

/**
 * Extended pipeline context with cross-encoder metadata
 */
export interface CrossEncoderPipelineContext extends PipelineContext {
  crossEncoder?: {
    applied: boolean;
    candidatesScored: number;
    processingTimeMs: number;
  };
}

/**
 * Dependencies for the cross-encoder stage
 */
export interface CrossEncoderDependencies {
  llmService: CrossEncoderLLMService;
  config?: Partial<CrossEncoderConfig>;
}

/**
 * Get rich text content from a query result item for LLM scoring
 */
function getItemTextForScoring(item: QueryResultItem): string {
  switch (item.type) {
    case 'tool': {
      const parts = [item.tool.name];
      if (item.tool.category) parts.push(`Category: ${item.tool.category}`);
      // Include version content if available
      if (item.version && typeof item.version === 'object') {
        const v = item.version as Record<string, unknown>;
        if (v.description) parts.push(String(v.description));
      }
      return parts.join('\n');
    }
    case 'guideline': {
      const parts = [item.guideline.name];
      if (item.guideline.category) parts.push(`Category: ${item.guideline.category}`);
      if (item.version && typeof item.version === 'object') {
        const v = item.version as Record<string, unknown>;
        if (v.content) parts.push(String(v.content));
        if (v.rationale) parts.push(`Rationale: ${String(v.rationale)}`);
      }
      return parts.join('\n');
    }
    case 'knowledge': {
      const parts = [item.knowledge.title];
      if (item.knowledge.category) parts.push(`Category: ${item.knowledge.category}`);
      if (item.version && typeof item.version === 'object') {
        const v = item.version as Record<string, unknown>;
        if (v.content) parts.push(String(v.content));
        if (v.source) parts.push(`Source: ${String(v.source)}`);
      }
      return parts.join('\n');
    }
    case 'experience': {
      const parts = [item.experience.title];
      if (item.experience.category) parts.push(`Category: ${item.experience.category}`);
      if (item.version && typeof item.version === 'object') {
        const v = item.version as Record<string, unknown>;
        if (v.content) parts.push(String(v.content));
        if (v.scenario) parts.push(`Scenario: ${String(v.scenario)}`);
        if (v.outcome) parts.push(`Outcome: ${String(v.outcome)}`);
      }
      return parts.join('\n');
    }
  }
}

/**
 * Create a cross-encoder re-ranking stage with injected dependencies
 *
 * @param deps - Dependencies including LLM service and config
 * @returns Pipeline stage function
 */
export function createCrossEncoderStage(
  deps: CrossEncoderDependencies
): (ctx: PipelineContext) => Promise<CrossEncoderPipelineContext> {
  const effectiveConfig = {
    ...DEFAULT_CROSS_ENCODER_CONFIG,
    ...deps.config,
  };

  return async function crossEncoderStage(
    ctx: PipelineContext
  ): Promise<CrossEncoderPipelineContext> {
    const startMs = Date.now();
    const { results, search } = ctx;

    // Check query-level toggle first, then fall back to global config
    // Allows per-query enable/disable for benchmarking and A/B testing
    const enabled = ctx.params.useCrossEncoder ?? effectiveConfig.enabled;

    // Early return if disabled or no results
    if (!enabled || results.length === 0 || !search) {
      return ctx as CrossEncoderPipelineContext;
    }

    // Skip if LLM service not available
    if (!deps.llmService.isAvailable()) {
      return ctx as CrossEncoderPipelineContext;
    }

    try {
      // Select top-K candidates for cross-encoder scoring
      const topK = Math.min(effectiveConfig.topK, results.length);
      const candidates = results.slice(0, topK);
      const passThrough = results.slice(topK);

      // Build documents for scoring
      const documents = candidates.map((item) => ({
        id: item.id,
        text: getItemTextForScoring(item),
      }));

      // Score all candidates using LLM
      const scores = await deps.llmService.scoreRelevance(search, documents);

      // Build score map for quick lookup
      const scoreMap = new Map(scores.map((s) => [s.id, s.score]));

      // Apply cross-encoder scores with blending
      const rerankedCandidates = candidates.map((item) => {
        const crossScore = scoreMap.get(item.id) ?? 0;
        const originalScore = item.score;

        // Blend scores: alpha * cross-encoder + (1-alpha) * original
        const blendedScore =
          effectiveConfig.alpha * crossScore + (1 - effectiveConfig.alpha) * originalScore;

        return {
          ...item,
          score: blendedScore,
        };
      });

      // Sort re-ranked candidates by new score
      rerankedCandidates.sort((a, b) => b.score - a.score);

      // Combine re-ranked candidates with pass-through results
      const finalResults = [...rerankedCandidates, ...passThrough];

      return {
        ...ctx,
        results: finalResults,
        crossEncoder: {
          applied: true,
          candidatesScored: topK,
          processingTimeMs: Date.now() - startMs,
        },
      };
    } catch (error) {
      // Log error and fall back to original results
      if (ctx.deps.logger) {
        ctx.deps.logger.debug(
          { error: error instanceof Error ? error.message : String(error) },
          'cross-encoder stage failed, using original scores'
        );
      }
      return ctx as CrossEncoderPipelineContext;
    }
  };
}

/**
 * Build the LLM prompt for batch relevance scoring
 */
export function buildScoringPrompt(
  query: string,
  documents: Array<{ id: string; text: string }>
): string {
  return buildEntityAwareScoringPrompt(query, documents);
}

/**
 * Build entity-aware LLM prompt for relevance scoring
 *
 * This prompt instructs the LLM to:
 * 1. Identify key entities (people, places, events) in the query
 * 2. Verify entity matches between query and documents
 * 3. Penalize entity mismatches (e.g., query about "Caroline" but doc about "Melanie")
 * 4. Return 0 for documents about different entities than the query asks about
 */
export function buildEntityAwareScoringPrompt(
  query: string,
  documents: Array<{ id: string; text: string }>
): string {
  const docList = documents
    .map((d, i) => `[DOC${i + 1}] ID: ${d.id}\n${d.text}`)
    .join('\n\n---\n\n');

  return `You are a relevance scoring system with STRICT ENTITY VERIFICATION.

QUERY: ${query}

DOCUMENTS:
${docList}

SCORING RULES:
1. First, identify the KEY ENTITIES in the query (people names, specific events, places, objects)
2. For each document, check if it's about THE SAME entities as the query
3. CRITICAL: If the query asks about Person A but the document is about Person B, score it 0-2 (entity mismatch)
4. Only give high scores (7-10) if BOTH the topic AND entities match

ENTITY MISMATCH EXAMPLES:
- Query: "What did Caroline do at the race?" + Doc about Melanie's race → Score 0-2
- Query: "What is Oscar's favorite toy?" + Doc about a different pet → Score 0-2
- Query: "When did John visit Paris?" + Doc about John visiting London → Score 0-2

SCORING SCALE:
- 10: Perfect match - same entities, directly answers the query
- 7-9: Same entities, highly relevant information
- 4-6: Same entities, partially relevant
- 1-3: Related topic but DIFFERENT entities or tangentially related
- 0: Entity mismatch OR completely irrelevant

Output format (JSON array):
[{"id": "doc_id", "score": N}, ...]

Only output the JSON array, no explanation.`;
}

/**
 * Parse LLM response for scores
 */
export function parseScoresResponse(
  response: string,
  documentIds: string[]
): Array<{ id: string; score: number }> {
  try {
    // Try to extract JSON array from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return documentIds.map((id) => ({ id, score: 0 }));
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{ id: string; score: number }>;

    // Bug #224 fix: Detect actual score range and normalize adaptively
    // Some LLMs may return 0-100, 0-10, 1-5, or other ranges
    const scores = parsed
      .map((item) => item.score ?? 0)
      .filter((s) => typeof s === 'number' && !isNaN(s));

    if (scores.length === 0) {
      return documentIds.map((id) => ({ id, score: 0.5 }));
    }

    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);

    // Determine normalization divisor based on detected range
    let divisor = 10; // default: assume 0-10 as per prompt
    if (maxScore > 10) {
      // LLM returned percentage-like scores (0-100)
      divisor = 100;
    } else if (maxScore <= 5 && minScore >= 0) {
      // LLM returned 0-5 or 1-5 scale
      divisor = 5;
    }

    // Normalize scores to 0-1 range with adaptive divisor
    // Bug #258 fix: Guard against NaN from LLM type assertion
    return parsed.map((item) => {
      const rawScore = Number(item.score);
      const normalizedScore = Number.isFinite(rawScore) ? rawScore / divisor : 0.5;
      return {
        id: item.id,
        score: Math.min(1, Math.max(0, normalizedScore)),
      };
    });
  } catch {
    // If parsing fails, return neutral scores
    return documentIds.map((id) => ({ id, score: 0.5 }));
  }
}

/**
 * Create an LLM service adapter for cross-encoder scoring
 * using the OpenAI-compatible API (LM Studio, etc.)
 */
export function createOpenAICrossEncoderService(options: {
  baseUrl: string;
  model: string;
  apiKey?: string;
  temperature?: number;
  timeoutMs?: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
}): CrossEncoderLLMService {
  const { baseUrl, model, apiKey, temperature = 0.1, timeoutMs = 30000, reasoningEffort } = options;

  let available = true;

  return {
    isAvailable: () => available,

    scoreRelevance: async (query, documents) => {
      if (documents.length === 0) return [];

      const prompt = buildScoringPrompt(query, documents);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature,
            max_tokens: 500,
            // reasoning_effort for models with extended thinking (o1/o3, LM Studio)
            ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          available = false;
          throw new Error(`LLM API error: ${response.status}`);
        }

        const data = (await response.json()) as {
          choices: Array<{ message: { content: string } }>;
        };

        // Bug #263 fix: Validate response structure instead of silent fallback
        if (!data.choices || data.choices.length === 0) {
          throw new Error('LLM response missing choices array');
        }
        const content = data.choices[0]?.message?.content;
        if (content === undefined || content === null) {
          throw new Error('LLM response missing message content');
        }
        return parseScoresResponse(
          content,
          documents.map((d) => d.id)
        );
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Cross-encoder scoring timed out');
        }
        throw error;
      } finally {
        // Bug #314 fix: Clear timeout in finally block to prevent memory leak on error paths
        clearTimeout(timeoutId);
      }
    },
  };
}
