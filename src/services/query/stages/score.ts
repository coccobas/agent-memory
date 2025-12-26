/**
 * Score Stage
 *
 * Computes relevance scores for filtered entries and builds result items.
 *
 * Performance Optimization: Two-Phase Scoring
 * ==========================================
 * Phase 1 (Light Scoring):
 *   - Computes quick approximation scores for ALL entries
 *   - Uses only cheap calculations (no Date parsing, no recency decay)
 *   - Includes: relations, tags, scope proximity, text match, priority
 *
 * Phase 2 (Full Scoring):
 *   - Takes top candidates (1.5x limit) from Phase 1
 *   - Applies expensive calculations only to these candidates
 *   - Includes: semantic similarity, recency decay (Date parsing, exponential math)
 *   - Applies feedback-based multipliers (boost for positive, penalty for negative)
 *
 * Performance Gain:
 *   - Reduces Date.parse() calls by ~85% (from all entries to top 1.5x limit)
 *   - Avoids exponential/linear decay calculations for low-scoring entries
 *   - Maintains scoring accuracy for final results (same top candidates)
 *
 * Feedback-Based Scoring:
 *   - Positive feedback: +2% per positive outcome, max +10%
 *   - Negative feedback: Graduated penalty (0.9, 0.8, 0.7, 0.6, 0.5 minimum)
 *   - Scores are cached in an LRU cache for performance
 */

import type { Tool, Guideline, Knowledge, Experience } from '../../../db/schema.js';
import type {
  PipelineContext,
  QueryResultItem,
  QueryEntryType,
  FilteredEntry,
} from '../pipeline.js';
import { config } from '../../../config/index.js';
import {
  getFeedbackMultiplier,
  type FeedbackScoringConfig,
} from '../feedback-cache.js';
import type { EntryFeedbackScore } from '../../feedback/repositories/retrieval.repository.js';
import {
  getEntityMatchBoost,
  type EntityFilterPipelineContext,
} from './entity-filter.js';

// Scoring weights from centralized config
const SCORE_WEIGHTS = config.scoring.weights;

// Feedback scoring configuration from centralized config
const FEEDBACK_SCORING_CONFIG: FeedbackScoringConfig = config.scoring.feedbackScoring;

// Entity scoring configuration from centralized config
const ENTITY_SCORING_CONFIG = config.scoring.entityScoring;

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
  entityMatchBoost?: number;
}

interface ScoreResult {
  score: number;
  recencyScore?: number;
  ageDays?: number;
}

interface LightScoreParams {
  hasExplicitRelation: boolean;
  matchingTagCount: number;
  scopeIndex: number;
  totalScopes: number;
  textMatched: boolean;
  priority: number | null;
  entityMatchBoost?: number;
}

/**
 * Phase 1: Compute lightweight score for quick filtering.
 * Only uses cheap calculations (no Date parsing, no recency decay).
 *
 * This approximates the final score well enough to identify top candidates.
 */
function computeLightScore(params: LightScoreParams): number {
  let score = 0;

  // Entity match boost (high priority signal for entity-aware retrieval)
  if (params.entityMatchBoost) {
    score += params.entityMatchBoost;
  }

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

  return score;
}

/**
 * Phase 2: Compute full relevance score including expensive calculations.
 * Only called for top candidates after light scoring filter.
 */
function computeScore(params: ScoreParams): ScoreResult {
  let score = 0;

  // Entity match boost (high priority signal for entity-aware retrieval)
  if (params.entityMatchBoost) {
    score += params.entityMatchBoost;
  }

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

  // Recency score calculation (EXPENSIVE - Date parsing and math)
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

type EntryUnion = Tool | Guideline | Knowledge | Experience;

interface ResultConfig<T extends EntryUnion> {
  type: QueryEntryType;
  entityKey: 'tool' | 'guideline' | 'knowledge' | 'experience';
  getPriority: (entry: T) => number | null;
}

const RESULT_CONFIGS: {
  tool: ResultConfig<Tool>;
  guideline: ResultConfig<Guideline>;
  knowledge: ResultConfig<Knowledge>;
  experience: ResultConfig<Experience>;
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
  experience: {
    type: 'experience',
    entityKey: 'experience',
    getPriority: () => null,
  },
};

// =============================================================================
// GENERIC RESULT BUILDER
// =============================================================================

/**
 * Generic result builder that works for all entry types.
 * The config object provides type-specific properties and priority extraction.
 *
 * Applies feedback-based score multiplier if feedback scores are available.
 */
function buildResult<T extends EntryUnion>(
  filtered: FilteredEntry<T>,
  ctx: PipelineContext,
  resultConfig: ResultConfig<T>,
  feedbackScores?: Map<string, EntryFeedbackScore>,
  entityMatchBoost?: number
): QueryResultItem {
  const { entry, scopeIndex, tags, textMatched, matchingTagCount, hasExplicitRelation } = filtered;
  const { scopeChain, semanticScores } = ctx;

  const { score: baseScore, recencyScore, ageDays } = computeScore({
    hasExplicitRelation,
    matchingTagCount,
    scopeIndex,
    totalScopes: scopeChain.length,
    textMatched,
    priority: resultConfig.getPriority(entry),
    createdAt: entry.createdAt,
    semanticScore: semanticScores?.get(entry.id),
    recencyWeight: ctx.params.recencyWeight,
    decayHalfLifeDays: ctx.params.decayHalfLifeDays,
    decayFunction: ctx.params.decayFunction,
    useUpdatedAt: ctx.params.useUpdatedAt,
    entityMatchBoost,
  });

  // Apply feedback multiplier if available
  let finalScore = baseScore;
  let feedbackMultiplier: number | undefined;

  if (FEEDBACK_SCORING_CONFIG.enabled && feedbackScores) {
    const feedback = feedbackScores.get(entry.id);
    if (feedback) {
      feedbackMultiplier = getFeedbackMultiplier(feedback, FEEDBACK_SCORING_CONFIG);
      finalScore = baseScore * feedbackMultiplier;
    }
  }

  // Build base result with common fields
  const baseResult = {
    type: resultConfig.type,
    id: entry.id,
    scopeType: entry.scopeType,
    scopeId: entry.scopeId ?? null,
    tags,
    score: finalScore,
    recencyScore,
    ageDays,
    feedbackMultiplier, // Include for debugging/transparency
  };

  // Add entity-specific field using dynamic key
  // Note: feedbackMultiplier is added for debugging/transparency but not in the QueryResultItem type
  return {
    ...baseResult,
    [resultConfig.entityKey]: entry,
  } as unknown as QueryResultItem;
}

// =============================================================================
// LIGHT SCORING HELPER
// =============================================================================

/**
 * Compute light score for a filtered entry.
 * Fast approximation using only cheap calculations.
 */
function computeLightScoreForItem<T extends EntryUnion>(
  filtered: FilteredEntry<T>,
  ctx: PipelineContext,
  config: ResultConfig<T>,
  entityMatchBoost?: number
): number {
  const { entry, scopeIndex, textMatched, matchingTagCount, hasExplicitRelation } = filtered;
  const { scopeChain } = ctx;

  return computeLightScore({
    hasExplicitRelation,
    matchingTagCount,
    scopeIndex,
    totalScopes: scopeChain.length,
    textMatched,
    priority: config.getPriority(entry),
    entityMatchBoost,
  });
}

// =============================================================================
// SCORE STAGE
// =============================================================================

/**
 * Extended pipeline context with feedback scores.
 * Populated by the feedbackStage if enabled.
 */
export interface PipelineContextWithFeedback extends PipelineContext {
  feedbackScores?: Map<string, EntryFeedbackScore>;
}

/**
 * Score stage - computes scores and builds result items using two-phase approach:
 * 1. Light scoring: Quick approximation for all entries
 * 2. Full scoring: Expensive calculations only for top candidates
 *
 * Expects ctx.filtered to be populated by the filter stage.
 * Uses entity match boost from ctx.entityFilter if available (entity-aware retrieval).
 * Applies feedback multipliers from ctx.feedbackScores if available.
 */
export function scoreStage(ctx: PipelineContext): PipelineContext {
  // ctx.filtered is now properly typed (no more unsafe cast needed)
  const filtered = ctx.filtered;
  if (!filtered) {
    // Filter stage was not run - return empty results
    return { ...ctx, results: [] };
  }

  const limit = ctx.params.limit ?? 100;

  // Cast to EntityFilterPipelineContext to access entity filter data
  const entityCtx = ctx as EntityFilterPipelineContext;

  // Helper to compute entity match boost for an entry
  const computeEntityBoost = (entryId: string): number | undefined => {
    if (!ENTITY_SCORING_CONFIG.enabled) return undefined;
    return getEntityMatchBoost(entryId, entityCtx, {
      enabled: ENTITY_SCORING_CONFIG.enabled,
      exactMatchBoost: ENTITY_SCORING_CONFIG.exactMatchBoost,
      partialMatchBoost: ENTITY_SCORING_CONFIG.partialMatchBoost,
      minEntitiesForFilter: 0,
    });
  };

  // Phase 1: Light scoring - compute cheap approximation for ALL entries
  // Use any for the mixed array since we're only using it for sorting
  const lightScoredItems: Array<{
    filtered: FilteredEntry<EntryUnion>;
    lightScore: number;
    config: ResultConfig<EntryUnion>;
    entityBoost: number | undefined;
  }> = [];

  for (const item of filtered.tools) {
    const entityBoost = computeEntityBoost(item.entry.id);
    lightScoredItems.push({
      filtered: item as FilteredEntry<EntryUnion>,
      lightScore: computeLightScoreForItem(item, ctx, RESULT_CONFIGS.tool, entityBoost),
      config: RESULT_CONFIGS.tool as ResultConfig<EntryUnion>,
      entityBoost,
    });
  }
  for (const item of filtered.guidelines) {
    const entityBoost = computeEntityBoost(item.entry.id);
    lightScoredItems.push({
      filtered: item as FilteredEntry<EntryUnion>,
      lightScore: computeLightScoreForItem(item, ctx, RESULT_CONFIGS.guideline, entityBoost),
      config: RESULT_CONFIGS.guideline as ResultConfig<EntryUnion>,
      entityBoost,
    });
  }
  for (const item of filtered.knowledge) {
    const entityBoost = computeEntityBoost(item.entry.id);
    lightScoredItems.push({
      filtered: item as FilteredEntry<EntryUnion>,
      lightScore: computeLightScoreForItem(item, ctx, RESULT_CONFIGS.knowledge, entityBoost),
      config: RESULT_CONFIGS.knowledge as ResultConfig<EntryUnion>,
      entityBoost,
    });
  }
  for (const item of filtered.experiences) {
    const entityBoost = computeEntityBoost(item.entry.id);
    lightScoredItems.push({
      filtered: item as FilteredEntry<EntryUnion>,
      lightScore: computeLightScoreForItem(item, ctx, RESULT_CONFIGS.experience, entityBoost),
      config: RESULT_CONFIGS.experience as ResultConfig<EntryUnion>,
      entityBoost,
    });
  }

  // Sort by light score to identify top candidates
  lightScoredItems.sort((a, b) => b.lightScore - a.lightScore);

  // Take top candidates (1.5x limit to allow for scoring variations)
  const candidateCount = Math.ceil(limit * 1.5);
  const topCandidates = lightScoredItems.slice(0, candidateCount);

  // Get feedback scores from context if available
  // These are pre-loaded by the feedbackStage if enabled
  const feedbackScores = (ctx as PipelineContextWithFeedback).feedbackScores;

  // Phase 2: Full scoring - apply expensive calculations only to top candidates
  const results: QueryResultItem[] = [];

  for (const { filtered: item, config, entityBoost } of topCandidates) {
    results.push(
      buildResult(
        item as FilteredEntry<EntryUnion>,
        ctx,
        config as ResultConfig<EntryUnion>,
        feedbackScores,
        entityBoost
      )
    );
  }

  // Final sort by full score desc, then by createdAt desc
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
  if (item.type === 'knowledge') return item.knowledge.createdAt ?? '';
  return item.experience.createdAt ?? '';
}
