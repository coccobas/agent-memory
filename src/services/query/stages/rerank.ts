/**
 * Neural Re-ranking Stage
 *
 * Applies neural re-ranking to improve result quality after initial scoring.
 * Uses embeddings to compute cross-encoder-style similarity between query
 * and candidate documents, then blends with the original score.
 *
 * ## When to Use Re-ranking
 *
 * Re-ranking is most effective when:
 * - Query is semantic (natural language, not exact keyword match)
 * - Initial retrieval returns multiple similar results
 * - High precision is more important than latency
 *
 * ## Algorithm
 *
 * 1. Take top-N candidates from initial scoring (configurable, default 20)
 * 2. Generate embeddings for query and candidate texts
 * 3. Compute cosine similarity between query and each candidate
 * 4. Blend original score with semantic similarity:
 *    finalScore = alpha * semanticScore + (1 - alpha) * originalScore
 * 5. Re-sort by final score
 *
 * ## Performance Considerations
 *
 * - Only processes top-N candidates to minimize embedding API calls
 * - Batches embedding requests for efficiency
 * - Caches embeddings when possible
 * - Falls back to original scores if embedding service unavailable
 */

import type { PipelineContext, QueryResultItem } from '../pipeline.js';
import { config } from '../../../config/index.js';

/**
 * Minimal embedding service interface for re-ranking
 */
export interface RerankEmbeddingService {
  /** Generate embedding for a single text */
  embed: (text: string) => Promise<{ embedding: number[]; model: string }>;
  /** Generate embeddings for multiple texts in batch */
  embedBatch: (texts: string[]) => Promise<{ embeddings: number[][]; model: string }>;
  /** Check if embedding service is available */
  isAvailable: () => boolean;
}

/**
 * Re-ranking configuration
 */
export interface RerankConfig {
  /** Enable re-ranking stage */
  enabled: boolean;
  /** Number of top candidates to re-rank (others pass through) */
  topK: number;
  /** Blend factor: 1.0 = pure semantic, 0.0 = pure original score */
  alpha: number;
  /** Minimum score threshold to apply re-ranking */
  minScoreThreshold: number;
  /** Only re-rank semantic search queries */
  semanticQueriesOnly: boolean;
}

/**
 * Default re-ranking configuration
 */
export const DEFAULT_RERANK_CONFIG: RerankConfig = {
  enabled: false,
  topK: 20,
  alpha: 0.5,
  minScoreThreshold: 0.1,
  semanticQueriesOnly: true,
};

/**
 * Extended pipeline context with re-ranking metadata
 */
export interface RerankPipelineContext extends PipelineContext {
  rerank?: {
    applied: boolean;
    candidatesProcessed: number;
    embeddingModel: string;
    processingTimeMs: number;
  };
}

/**
 * Dependencies for the rerank stage
 */
export interface RerankDependencies {
  embeddingService: RerankEmbeddingService;
  config?: Partial<RerankConfig>;
}

/**
 * Get text content from a query result item for embedding.
 * Uses available metadata fields since versioned content may not be loaded.
 */
function getItemText(item: QueryResultItem): string {
  switch (item.type) {
    case 'tool': {
      // Tool: use name and category
      const category = item.tool.category || '';
      return `${item.tool.name} ${category}`.trim();
    }
    case 'guideline': {
      // Guideline: use name and category - versioned content may not be available
      const category = item.guideline.category || '';
      return `${item.guideline.name} ${category}`.trim();
    }
    case 'knowledge': {
      // Knowledge: use title and category
      const category = item.knowledge.category || '';
      return `${item.knowledge.title} ${category}`.trim();
    }
    case 'experience': {
      // Experience: use title and category
      const category = item.experience.category || '';
      return `${item.experience.title} ${category}`.trim();
    }
  }
}

function safeJoinParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function buildInClausePlaceholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(',');
}

/**
 * Fetch richer per-entry text (current version content) for better reranking.
 * Uses best-effort raw SQL via deps.getPreparedStatement and falls back silently.
 */
function hydrateCandidateTexts(
  ctx: PipelineContext,
  candidates: QueryResultItem[]
): Map<string, string> {
  const hydrated = new Map<string, string>();

  if (candidates.length === 0) return hydrated;

  try {
    const byType: Record<QueryResultItem['type'], string[]> = {
      tool: [],
      guideline: [],
      knowledge: [],
      experience: [],
    };

    for (const c of candidates) byType[c.type].push(c.id);

    // Knowledge
    if (byType.knowledge.length > 0) {
      const ids = byType.knowledge;
      const sql = `
        SELECT k.id AS id, k.title AS title, COALESCE(kv.content, '') AS content, COALESCE(kv.source, '') AS source
        FROM knowledge k
        LEFT JOIN knowledge_versions kv ON kv.id = k.current_version_id
        WHERE k.id IN (${buildInClausePlaceholders(ids.length)})
      `;
      const rows = ctx.deps.getPreparedStatement(sql).all(...ids) as Array<{
        id: string;
        title: string;
        content: string;
        source: string;
      }>;
      for (const r of rows) {
        hydrated.set(
          r.id,
          safeJoinParts([r.title, r.content, r.source ? `source: ${r.source}` : ''])
        );
      }
    }

    // Guidelines
    if (byType.guideline.length > 0) {
      const ids = byType.guideline;
      const sql = `
        SELECT g.id AS id, g.name AS name, COALESCE(gv.content, '') AS content, COALESCE(gv.rationale, '') AS rationale
        FROM guidelines g
        LEFT JOIN guideline_versions gv ON gv.id = g.current_version_id
        WHERE g.id IN (${buildInClausePlaceholders(ids.length)})
      `;
      const rows = ctx.deps.getPreparedStatement(sql).all(...ids) as Array<{
        id: string;
        name: string;
        content: string;
        rationale: string;
      }>;
      for (const r of rows) {
        hydrated.set(r.id, safeJoinParts([r.name, r.content, r.rationale]));
      }
    }

    // Tools
    if (byType.tool.length > 0) {
      const ids = byType.tool;
      const sql = `
        SELECT t.id AS id, t.name AS name, COALESCE(tv.description, '') AS description
        FROM tools t
        LEFT JOIN tool_versions tv ON tv.id = t.current_version_id
        WHERE t.id IN (${buildInClausePlaceholders(ids.length)})
      `;
      const rows = ctx.deps.getPreparedStatement(sql).all(...ids) as Array<{
        id: string;
        name: string;
        description: string;
      }>;
      for (const r of rows) {
        hydrated.set(r.id, safeJoinParts([r.name, r.description]));
      }
    }

    // Experiences
    if (byType.experience.length > 0) {
      const ids = byType.experience;
      const sql = `
        SELECT e.id AS id, e.title AS title,
               COALESCE(ev.content, '') AS content,
               COALESCE(ev.scenario, '') AS scenario,
               COALESCE(ev.outcome, '') AS outcome,
               COALESCE(ev.pattern, '') AS pattern,
               COALESCE(ev.applicability, '') AS applicability
        FROM experiences e
        LEFT JOIN experience_versions ev ON ev.id = e.current_version_id
        WHERE e.id IN (${buildInClausePlaceholders(ids.length)})
      `;
      const rows = ctx.deps.getPreparedStatement(sql).all(...ids) as Array<{
        id: string;
        title: string;
        content: string;
        scenario: string;
        outcome: string;
        pattern: string;
        applicability: string;
      }>;
      for (const r of rows) {
        hydrated.set(
          r.id,
          safeJoinParts([r.title, r.content, r.scenario, r.outcome, r.pattern, r.applicability])
        );
      }
    }
  } catch {
    // Best-effort only; fall back to lightweight item text.
  }

  return hydrated;
}

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i] ?? 0;
    const bVal = b[i] ?? 0;
    dotProduct += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude > 0 ? dotProduct / magnitude : 0;
}

/**
 * Create a re-ranking stage with injected dependencies
 *
 * @param deps - Dependencies including embedding service and config
 * @returns Pipeline stage function
 */
export function createRerankStage(
  deps: RerankDependencies
): (ctx: PipelineContext) => Promise<RerankPipelineContext> {
  const effectiveConfig = {
    ...DEFAULT_RERANK_CONFIG,
    ...deps.config,
  };

  return async function rerankStage(ctx: PipelineContext): Promise<RerankPipelineContext> {
    const startMs = Date.now();
    const { results, search, params } = ctx;

    // Early return if disabled or no results
    if (!effectiveConfig.enabled || results.length === 0 || !search) {
      return ctx as RerankPipelineContext;
    }

    // Skip if semantic-only mode and not a semantic search
    if (effectiveConfig.semanticQueriesOnly && !params.semanticSearch) {
      return ctx as RerankPipelineContext;
    }

    // Skip if embedding service not available
    if (!deps.embeddingService.isAvailable()) {
      return ctx as RerankPipelineContext;
    }

    try {
      // Select top-K candidates for re-ranking
      const topK = Math.min(effectiveConfig.topK, results.length);
      const candidates = results.slice(0, topK);
      const passThrough = results.slice(topK);

      // Hydrate richer candidate text for reranking (best-effort)
      const hydratedTexts = hydrateCandidateTexts(ctx, candidates);

      // Generate query embedding
      const queryEmbedding = await deps.embeddingService.embed(search);

      // Generate embeddings for all candidates in batch
      const candidateTexts = candidates.map(
        (item) => hydratedTexts.get(item.id) ?? getItemText(item)
      );
      const candidateEmbeddings = await deps.embeddingService.embedBatch(candidateTexts);

      // Compute semantic scores and blend with original scores
      const rerankedCandidates = candidates.map((item, idx) => {
        const candidateEmbedding = candidateEmbeddings.embeddings[idx];
        if (!candidateEmbedding) {
          // No embedding available, keep original score
          return item;
        }

        const semanticScore = cosineSimilarity(queryEmbedding.embedding, candidateEmbedding);
        const originalScore = item.score;

        // Skip re-ranking for items below threshold
        if (originalScore < effectiveConfig.minScoreThreshold) {
          return item;
        }

        // Blend scores: alpha * semantic + (1-alpha) * original
        const blendedScore =
          effectiveConfig.alpha * semanticScore + (1 - effectiveConfig.alpha) * originalScore;

        // Return item with updated score (don't add extra properties)
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
        rerank: {
          applied: true,
          candidatesProcessed: topK,
          embeddingModel: queryEmbedding.model,
          processingTimeMs: Date.now() - startMs,
        },
      };
    } catch (error) {
      // Log error and fall back to original results
      if (ctx.deps.logger) {
        ctx.deps.logger.debug(
          { error: error instanceof Error ? error.message : String(error) },
          'rerank stage failed, using original scores'
        );
      }
      return ctx as RerankPipelineContext;
    }
  };
}

/**
 * Synchronous no-op rerank stage for pipelines without embedding service
 *
 * Returns the context unchanged.
 */
export function rerankStageNoop(ctx: PipelineContext): PipelineContext {
  return ctx;
}

/**
 * Check if re-ranking should be applied to a query
 *
 * @param ctx - Pipeline context
 * @param configOverride - Optional config override
 * @returns Whether re-ranking should be applied
 */
export function shouldApplyRerank(
  ctx: PipelineContext,
  configOverride?: Partial<RerankConfig>
): boolean {
  const effectiveConfig = {
    ...DEFAULT_RERANK_CONFIG,
    ...(config.rerank ?? {}),
    ...configOverride,
  };

  if (!effectiveConfig.enabled) return false;
  if (!ctx.search) return false;
  if (ctx.results.length === 0) return false;
  if (effectiveConfig.semanticQueriesOnly && !ctx.params.semanticSearch) return false;

  return true;
}

/**
 * Get re-ranking statistics from context
 */
export function getRerankStats(ctx: PipelineContext): {
  applied: boolean;
  candidatesProcessed: number;
  processingTimeMs: number;
} | null {
  const rerankCtx = ctx as RerankPipelineContext;
  if (!rerankCtx.rerank) return null;

  return {
    applied: rerankCtx.rerank.applied,
    candidatesProcessed: rerankCtx.rerank.candidatesProcessed,
    processingTimeMs: rerankCtx.rerank.processingTimeMs,
  };
}
