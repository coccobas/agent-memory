/**
 * Score Stage
 *
 * Computes relevance scores for filtered entries and builds result items.
 */

import type { Tool, Guideline, Knowledge } from '../../../db/schema.js';
import type {
  PipelineContext,
  QueryResultItem,
  QueryEntryType,
  FilteredEntry,
} from '../pipeline.js';
import { config } from '../../../config/index.js';

// Scoring weights from centralized config
const SCORE_WEIGHTS = config.scoring.weights;

// =============================================================================
// SCORE COMPUTATION
// =============================================================================

interface ScoreParams {
  hasExplicitRelation: boolean;
  matchingTagCount: number;
  scopeIndex: number;
  totalScopes: number;
  textMatched: boolean;
  priority: number | null;
  createdAt: string;
  updatedAt?: string;
  recencyWeight?: number;
  decayHalfLifeDays?: number;
  decayFunction?: 'exponential' | 'linear' | 'step';
  useUpdatedAt?: boolean;
  semanticScore?: number;
}

interface ScoreResult {
  score: number;
  recencyScore?: number;
  ageDays?: number;
}

/**
 * Compute relevance score for an entry
 */
function computeScore(params: ScoreParams): ScoreResult {
  let score = 0;

  // Relation boost (high priority signal)
  if (params.hasExplicitRelation) {
    score += SCORE_WEIGHTS.explicitRelation;
  }

  // Tag matching boost
  score += params.matchingTagCount * SCORE_WEIGHTS.tagMatch;

  // Scope proximity boost (closer scopes = higher score)
  if (params.totalScopes > 1) {
    const scopeBoost =
      ((params.totalScopes - params.scopeIndex) / params.totalScopes) *
      SCORE_WEIGHTS.scopeProximity;
    score += scopeBoost;
  }

  // Text match boost
  if (params.textMatched) {
    score += SCORE_WEIGHTS.textMatch;
  }

  // Priority boost (for guidelines, 0-100 range)
  if (params.priority !== null) {
    score += params.priority * (SCORE_WEIGHTS.priorityMax / 100);
  }

  // Semantic similarity boost
  if (params.semanticScore !== undefined) {
    score += params.semanticScore * SCORE_WEIGHTS.semanticMax;
  }

  // Recency score calculation
  let recencyScore: number | undefined;
  let ageDays: number | undefined;

  const recencyWeight = params.recencyWeight ?? 0.1;
  if (recencyWeight > 0) {
    const dateStr = params.useUpdatedAt ? params.updatedAt : params.createdAt;
    if (dateStr) {
      const dateMs = new Date(dateStr).getTime();
      const nowMs = Date.now();
      ageDays = (nowMs - dateMs) / (1000 * 60 * 60 * 24);

      const halfLife = params.decayHalfLifeDays ?? 30;
      const decayFn = params.decayFunction ?? 'exponential';

      if (decayFn === 'exponential') {
        recencyScore = Math.exp((-Math.LN2 * ageDays) / halfLife);
      } else if (decayFn === 'linear') {
        recencyScore = Math.max(0, 1 - ageDays / (halfLife * 2));
      } else {
        // step
        recencyScore = ageDays <= halfLife ? 1 : 0.5;
      }

      score += recencyScore * recencyWeight * SCORE_WEIGHTS.recencyMax;
    }
  }

  return { score, recencyScore, ageDays };
}

// =============================================================================
// RESULT BUILDER CONFIGURATION
// =============================================================================

type EntryUnion = Tool | Guideline | Knowledge;

interface ResultConfig<T extends EntryUnion> {
  type: QueryEntryType;
  entityKey: 'tool' | 'guideline' | 'knowledge';
  getPriority: (entry: T) => number | null;
}

const RESULT_CONFIGS: {
  tool: ResultConfig<Tool>;
  guideline: ResultConfig<Guideline>;
  knowledge: ResultConfig<Knowledge>;
} = {
  tool: {
    type: 'tool',
    entityKey: 'tool',
    getPriority: () => null,
  },
  guideline: {
    type: 'guideline',
    entityKey: 'guideline',
    getPriority: (entry) => entry.priority,
  },
  knowledge: {
    type: 'knowledge',
    entityKey: 'knowledge',
    getPriority: () => null,
  },
};

// =============================================================================
// GENERIC RESULT BUILDER
// =============================================================================

/**
 * Generic result builder that works for all entry types.
 * The config object provides type-specific properties and priority extraction.
 */
function buildResult<T extends EntryUnion>(
  filtered: FilteredEntry<T>,
  ctx: PipelineContext,
  config: ResultConfig<T>
): QueryResultItem {
  const { entry, scopeIndex, tags, textMatched, matchingTagCount, hasExplicitRelation } = filtered;
  const { scopeChain, semanticScores } = ctx;

  const { score, recencyScore, ageDays } = computeScore({
    hasExplicitRelation,
    matchingTagCount,
    scopeIndex,
    totalScopes: scopeChain.length,
    textMatched,
    priority: config.getPriority(entry),
    createdAt: entry.createdAt,
    semanticScore: semanticScores?.get(entry.id),
    recencyWeight: ctx.params.recencyWeight,
    decayHalfLifeDays: ctx.params.decayHalfLifeDays,
    decayFunction: ctx.params.decayFunction,
    useUpdatedAt: ctx.params.useUpdatedAt,
  });

  // Build base result with common fields
  const baseResult = {
    type: config.type,
    id: entry.id,
    scopeType: entry.scopeType,
    scopeId: entry.scopeId ?? null,
    tags,
    score,
    recencyScore,
    ageDays,
  };

  // Add entity-specific field using dynamic key
  return {
    ...baseResult,
    [config.entityKey]: entry,
  } as QueryResultItem;
}

// =============================================================================
// SCORE STAGE
// =============================================================================

/**
 * Score stage - computes scores and builds result items
 *
 * Expects ctx.filtered to be populated by the filter stage.
 */
export function scoreStage(ctx: PipelineContext): PipelineContext {
  // ctx.filtered is now properly typed (no more unsafe cast needed)
  const filtered = ctx.filtered;
  if (!filtered) {
    // Filter stage was not run - return empty results
    return { ...ctx, results: [] };
  }

  const results: QueryResultItem[] = [];

  // Build result items for each type using the generic builder
  for (const item of filtered.tools) {
    results.push(buildResult(item, ctx, RESULT_CONFIGS.tool));
  }
  for (const item of filtered.guidelines) {
    results.push(buildResult(item, ctx, RESULT_CONFIGS.guideline));
  }
  for (const item of filtered.knowledge) {
    results.push(buildResult(item, ctx, RESULT_CONFIGS.knowledge));
  }

  // Sort by score desc, then by createdAt desc
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aCreated = getCreatedAt(a);
    const bCreated = getCreatedAt(b);
    return bCreated.localeCompare(aCreated);
  });

  return {
    ...ctx,
    results,
  };
}

function getCreatedAt(item: QueryResultItem): string {
  if (item.type === 'tool') return item.tool.createdAt ?? '';
  if (item.type === 'guideline') return item.guideline.createdAt ?? '';
  return item.knowledge.createdAt ?? '';
}
