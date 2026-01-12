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

  return async function crossEncoderStage(ctx: PipelineContext): Promise<CrossEncoderPipelineContext> {
    const startMs = Date.now();
    const { results, search } = ctx;

    // Early return if disabled or no results
    if (!effectiveConfig.enabled || results.length === 0 || !search) {
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
          effectiveConfig.alpha * crossScore +
          (1 - effectiveConfig.alpha) * originalScore;

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
export function buildScoringPrompt(query: string, documents: Array<{ id: string; text: string }>): string {
  const docList = documents
    .map((d, i) => `[DOC${i + 1}] ID: ${d.id}\n${d.text}`)
    .join('\n\n---\n\n');

  return `You are a relevance scoring system. Rate how well each document answers or relates to the query.

QUERY: ${query}

DOCUMENTS:
${docList}

For each document, provide a relevance score from 0-10:
- 10: Perfect match, directly answers the query
- 7-9: Highly relevant, contains key information
- 4-6: Somewhat relevant, partial match
- 1-3: Tangentially related
- 0: Not relevant

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

    // Normalize scores to 0-1 range
    return parsed.map((item) => ({
      id: item.id,
      score: Math.min(1, Math.max(0, (item.score ?? 0) / 10)),
    }));
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

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'user', content: prompt },
            ],
            temperature,
            max_tokens: 500,
            // reasoning_effort for models with extended thinking (o1/o3, LM Studio)
            ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          available = false;
          throw new Error(`LLM API error: ${response.status}`);
        }

        const data = (await response.json()) as {
          choices: Array<{ message: { content: string } }>;
        };

        const content = data.choices[0]?.message?.content ?? '';
        return parseScoresResponse(content, documents.map((d) => d.id));
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Cross-encoder scoring timed out');
        }
        throw error;
      }
    },
  };
}
