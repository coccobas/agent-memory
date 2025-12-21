/**
 * Score Stage
 *
 * Computes relevance scores for filtered entries and builds result items.
 */

import type { Tool, Guideline, Knowledge } from '../../../db/schema.js';
import type {
  PipelineContext,
  QueryResultItem,
  ToolQueryResult,
  GuidelineQueryResult,
  KnowledgeQueryResult,
} from '../pipeline.js';
import type { FilterStageResult, FilteredEntry } from './filter.js';

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
    score += 50;
  }

  // Tag matching boost
  score += params.matchingTagCount * 10;

  // Scope proximity boost (closer scopes = higher score)
  if (params.totalScopes > 1) {
    const scopeBoost = ((params.totalScopes - params.scopeIndex) / params.totalScopes) * 20;
    score += scopeBoost;
  }

  // Text match boost
  if (params.textMatched) {
    score += 30;
  }

  // Priority boost (for guidelines, 0-100 range)
  if (params.priority !== null) {
    score += params.priority * 0.2; // Max 20 points from priority
  }

  // Semantic similarity boost
  if (params.semanticScore !== undefined) {
    score += params.semanticScore * 40; // Max 40 points from semantic
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

      score += recencyScore * recencyWeight * 100;
    }
  }

  return { score, recencyScore, ageDays };
}

/**
 * Build result item from filtered entry
 */
function buildToolResult(
  filtered: FilteredEntry<Tool>,
  ctx: PipelineContext
): ToolQueryResult {
  const { entry, scopeIndex, tags, textMatched, matchingTagCount, hasExplicitRelation } = filtered;
  const { scopeChain, semanticScores } = ctx;

  const { score, recencyScore, ageDays } = computeScore({
    hasExplicitRelation,
    matchingTagCount,
    scopeIndex,
    totalScopes: scopeChain.length,
    textMatched,
    priority: null,
    createdAt: entry.createdAt,
    semanticScore: semanticScores?.get(entry.id),
    recencyWeight: ctx.params.recencyWeight,
    decayHalfLifeDays: ctx.params.decayHalfLifeDays,
    decayFunction: ctx.params.decayFunction,
    useUpdatedAt: ctx.params.useUpdatedAt,
  });

  return {
    type: 'tool',
    id: entry.id,
    scopeType: entry.scopeType,
    scopeId: entry.scopeId ?? null,
    tags,
    score,
    recencyScore,
    ageDays,
    tool: entry,
  };
}

function buildGuidelineResult(
  filtered: FilteredEntry<Guideline>,
  ctx: PipelineContext
): GuidelineQueryResult {
  const { entry, scopeIndex, tags, textMatched, matchingTagCount, hasExplicitRelation } = filtered;
  const { scopeChain, semanticScores } = ctx;

  const { score, recencyScore, ageDays } = computeScore({
    hasExplicitRelation,
    matchingTagCount,
    scopeIndex,
    totalScopes: scopeChain.length,
    textMatched,
    priority: entry.priority,
    createdAt: entry.createdAt,
    semanticScore: semanticScores?.get(entry.id),
    recencyWeight: ctx.params.recencyWeight,
    decayHalfLifeDays: ctx.params.decayHalfLifeDays,
    decayFunction: ctx.params.decayFunction,
    useUpdatedAt: ctx.params.useUpdatedAt,
  });

  return {
    type: 'guideline',
    id: entry.id,
    scopeType: entry.scopeType,
    scopeId: entry.scopeId ?? null,
    tags,
    score,
    recencyScore,
    ageDays,
    guideline: entry,
  };
}

function buildKnowledgeResult(
  filtered: FilteredEntry<Knowledge>,
  ctx: PipelineContext
): KnowledgeQueryResult {
  const { entry, scopeIndex, tags, textMatched, matchingTagCount, hasExplicitRelation } = filtered;
  const { scopeChain, semanticScores } = ctx;

  const { score, recencyScore, ageDays } = computeScore({
    hasExplicitRelation,
    matchingTagCount,
    scopeIndex,
    totalScopes: scopeChain.length,
    textMatched,
    priority: null,
    createdAt: entry.createdAt,
    semanticScore: semanticScores?.get(entry.id),
    recencyWeight: ctx.params.recencyWeight,
    decayHalfLifeDays: ctx.params.decayHalfLifeDays,
    decayFunction: ctx.params.decayFunction,
    useUpdatedAt: ctx.params.useUpdatedAt,
  });

  return {
    type: 'knowledge',
    id: entry.id,
    scopeType: entry.scopeType,
    scopeId: entry.scopeId ?? null,
    tags,
    score,
    recencyScore,
    ageDays,
    knowledge: entry,
  };
}

/**
 * Score stage - computes scores and builds result items
 */
export function scoreStage(
  ctx: PipelineContext & { filtered: FilterStageResult }
): PipelineContext {
  const { filtered } = ctx;
  const results: QueryResultItem[] = [];

  // Build result items for each type
  for (const item of filtered.tools) {
    results.push(buildToolResult(item, ctx));
  }
  for (const item of filtered.guidelines) {
    results.push(buildGuidelineResult(item, ctx));
  }
  for (const item of filtered.knowledge) {
    results.push(buildKnowledgeResult(item, ctx));
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
