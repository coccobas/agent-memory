/**
 * Explain Service
 *
 * Converts query pipeline telemetry into human-readable explanations.
 * Answers "Why did this query return these results?"
 */

import type { PipelineTelemetry, StageTelemetry } from '../query/pipeline.js';
import type { QueryResultItem } from '../query/pipeline.js';
import type {
  NestedExplainResult,
  NestedExplainRequest,
  ResolveStageExplain,
  StrategyStageExplain,
  RewriteStageExplain,
  FtsStageExplain,
  SemanticStageExplain,
  HierarchicalStageExplain,
  FetchStageExplain,
  FilterStageExplain,
  ScoreStageExplain,
  RerankStageExplain,
  ScoreComponents,
} from './types.js';

export interface ExplainRequest {
  telemetry: PipelineTelemetry;
  results: QueryResultItem[];
  query?: string;
}

export interface ExplainResult {
  summary: string;
  stages: StageExplanation[];
  decisions: DecisionExplanation[];
  scoring: ScoringExplanation | null;
  timing: TimingExplanation;
}

export interface StageExplanation {
  name: string;
  description: string;
  duration: string;
  impact: 'high' | 'medium' | 'low' | 'skipped';
  details?: string;
}

export interface DecisionExplanation {
  decision: string;
  reason: string;
  impact: string;
}

export interface ScoringExplanation {
  candidateCount: number;
  afterFiltering: number;
  topScoreRange: string;
  factors: string[];
}

export interface TimingExplanation {
  total: string;
  breakdown: Array<{ stage: string; percent: number }>;
  bottleneck: string | null;
}

const STAGE_DESCRIPTIONS: Record<string, string> = {
  resolve: 'Resolved query parameters and scope chain',
  strategy: 'Selected search strategy based on query characteristics',
  rewrite: 'Rewrote query for better retrieval (HyDE/expansion)',
  hierarchical: 'Searched through summary hierarchies',
  semantic: 'Generated query embedding for semantic search',
  fts: 'Searched full-text index (FTS5)',
  relations: 'Traversed knowledge graph relations',
  fetch: 'Fetched candidate entries from database',
  entity_filter: 'Filtered by extracted entities',
  tags: 'Loaded tags for filtering and display',
  filter: 'Applied scope, text, and tag filters',
  feedback: 'Recorded retrieval feedback for learning',
  score: 'Calculated final relevance scores',
  sort: 'Sorted results by score',
  paginate: 'Applied pagination limits',
  format: 'Formatted results for output',
};

function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function getStageImpact(
  stage: StageTelemetry,
  totalMs: number
): 'high' | 'medium' | 'low' | 'skipped' {
  if (stage.durationMs === 0) return 'skipped';
  const percent = (stage.durationMs / totalMs) * 100;
  if (percent > 30) return 'high';
  if (percent > 10) return 'medium';
  return 'low';
}

export function explainQuery(request: ExplainRequest): ExplainResult {
  const { telemetry, results } = request;

  const stageExplanations: StageExplanation[] = telemetry.stages.map((stage) => ({
    name: stage.name,
    description: STAGE_DESCRIPTIONS[stage.name] || stage.name,
    duration: formatDuration(stage.durationMs),
    impact: getStageImpact(stage, telemetry.totalMs),
    details: stage.decisions ? JSON.stringify(stage.decisions) : undefined,
  }));

  const decisions: DecisionExplanation[] = [];

  if (telemetry.decisions.searchStrategy) {
    decisions.push({
      decision: `Search strategy: ${telemetry.decisions.searchStrategy}`,
      reason: getStrategyReason(telemetry.decisions.searchStrategy),
      impact: 'Determines which indexes and algorithms are used',
    });
  }

  if (telemetry.decisions.usedSemanticSearch) {
    decisions.push({
      decision: 'Semantic search enabled',
      reason: 'Query benefits from meaning-based similarity',
      impact: 'Uses embeddings for conceptual matching',
    });
  }

  if (telemetry.decisions.usedFts5) {
    decisions.push({
      decision: 'Full-text search enabled',
      reason: 'Query contains keywords for exact matching',
      impact: 'Uses FTS5 index for fast keyword lookup',
    });
  }

  if (telemetry.decisions.cacheHit) {
    decisions.push({
      decision: 'Cache hit',
      reason: 'Identical query was recently executed',
      impact: 'Returned cached results instantly',
    });
  }

  let scoring: ScoringExplanation | null = null;
  if (telemetry.scoring) {
    const scores = telemetry.scoring.topScores;
    scoring = {
      candidateCount: telemetry.scoring.totalCandidates,
      afterFiltering: telemetry.scoring.afterFullScoring,
      topScoreRange:
        scores.length > 0
          ? `${Math.min(...scores).toFixed(2)} - ${Math.max(...scores).toFixed(2)}`
          : 'N/A',
      factors: getScoringFactors(telemetry.decisions),
    };
  }

  const sortedStages = [...telemetry.stages].sort((a, b) => b.durationMs - a.durationMs);
  const topStage = sortedStages[0];
  const bottleneck =
    topStage && topStage.durationMs > telemetry.totalMs * 0.3 ? topStage.name : null;

  const timing: TimingExplanation = {
    total: formatDuration(telemetry.totalMs),
    breakdown: telemetry.stages
      .filter((s) => s.durationMs > 0)
      .map((s) => ({
        stage: s.name,
        percent: Math.round((s.durationMs / telemetry.totalMs) * 100),
      })),
    bottleneck,
  };

  const summary = generateSummary(results, telemetry);

  return {
    summary,
    stages: stageExplanations,
    decisions,
    scoring,
    timing,
  };
}

function getStrategyReason(strategy: string): string {
  switch (strategy) {
    case 'hybrid':
      return 'Combines semantic and keyword search for best coverage';
    case 'semantic':
      return 'Query is conceptual, using embedding similarity';
    case 'fts5':
      return 'Query contains specific keywords for exact matching';
    case 'like':
      return 'Fallback to LIKE pattern matching';
    default:
      return 'Automatically selected based on query';
  }
}

function getScoringFactors(decisions: PipelineTelemetry['decisions']): string[] {
  const factors: string[] = ['Scope proximity'];
  if (decisions.usedSemanticSearch) factors.push('Semantic similarity');
  if (decisions.usedFts5) factors.push('Keyword relevance (BM25)');
  if (decisions.tagFilterApplied) factors.push('Tag match bonus');
  if (decisions.relationFilterApplied) factors.push('Relation proximity');
  factors.push('Recency decay');
  return factors;
}

function generateSummary(results: QueryResultItem[], telemetry: PipelineTelemetry): string {
  const resultCount = results.length;
  const strategy = telemetry.decisions.searchStrategy || 'unknown';
  const cacheHit = telemetry.decisions.cacheHit ? ' (cached)' : '';
  const totalMs = formatDuration(telemetry.totalMs);

  if (resultCount === 0) {
    return `No results found using ${strategy} search in ${totalMs}${cacheHit}`;
  }

  const types = new Set(results.map((r) => r.type));
  const typeStr = Array.from(types).join(', ');

  return `Found ${resultCount} ${typeStr} entries using ${strategy} search in ${totalMs}${cacheHit}`;
}

export function explainQueryNested(request: NestedExplainRequest): NestedExplainResult {
  const { telemetry, context, results } = request;

  const getStageDuration = (name: string): number => {
    const stage = telemetry.stages.find((s) => s.name === name);
    return stage?.durationMs ?? 0;
  };

  const resolve: ResolveStageExplain = {
    scopeChain: context.scopeChain.map((s) => ({
      scopeType: s.scopeType,
      scopeId: s.scopeId ?? null,
    })),
    types: context.types as string[],
    limit: context.limit,
    offset: context.offset,
    durationMs: getStageDuration('resolve'),
  };

  const strategy: StrategyStageExplain = {
    strategy: (context.searchStrategy as 'hybrid' | 'semantic' | 'fts5' | 'like') ?? 'hybrid',
    reason: getStrategyReason(context.searchStrategy ?? 'hybrid'),
    durationMs: getStageDuration('strategy'),
  };

  const rewrite: RewriteStageExplain | undefined = context.searchQueries
    ? {
        originalQuery: context.search ?? '',
        rewrittenQueries: context.searchQueries.map((q) => ({
          text: q.text,
          source: q.source,
          weight: q.weight,
        })),
        intent: context.rewriteIntent,
        exclusions: context.exclusions?.map((e) => (e.isPhrase ? `"${e.term}"` : e.term)),
        durationMs: getStageDuration('rewrite'),
      }
    : undefined;

  const ftsMatchCount = context.ftsMatchIds
    ? Object.values(context.ftsMatchIds).reduce((sum, set) => sum + set.size, 0)
    : 0;
  const ftsTopScores = context.ftsScores
    ? Array.from(context.ftsScores.values())
        .sort((a, b) => b - a)
        .slice(0, 10)
    : [];

  const fts: FtsStageExplain = {
    used: telemetry.decisions.usedFts5 ?? false,
    matchCount: ftsMatchCount,
    topScores: ftsTopScores,
    durationMs: getStageDuration('fts'),
  };

  const semanticMatchCount = context.semanticScores?.size ?? 0;
  const semanticTopScores = context.semanticScores
    ? Array.from(context.semanticScores.values())
        .sort((a, b) => b - a)
        .slice(0, 10)
    : [];

  const semantic: SemanticStageExplain = {
    used: telemetry.decisions.usedSemanticSearch ?? false,
    matchCount: semanticMatchCount,
    topScores: semanticTopScores,
    durationMs: getStageDuration('semantic'),
  };

  const hierarchical: HierarchicalStageExplain = {
    used: telemetry.decisions.usedHierarchical ?? false,
    durationMs: getStageDuration('hierarchical'),
  };

  const totalFetched = Object.values(context.fetchedEntries).reduce(
    (sum, arr) => sum + arr.length,
    0
  );
  const fetchedByType: Record<string, number> = {
    tool: context.fetchedEntries.tools.length,
    guideline: context.fetchedEntries.guidelines.length,
    knowledge: context.fetchedEntries.knowledge.length,
    experience: context.fetchedEntries.experiences.length,
  };

  const fetch: FetchStageExplain = {
    fetchedByType,
    totalFetched,
    durationMs: getStageDuration('fetch'),
  };

  const beforeCount = totalFetched;
  const afterCount = context.filtered
    ? context.filtered.tools.length +
      context.filtered.guidelines.length +
      context.filtered.knowledge.length +
      context.filtered.experiences.length
    : results.length;

  const filtersApplied: string[] = [];
  if (context.search) filtersApplied.push('text_search');
  if (context.params.tags) filtersApplied.push('tags');
  if (context.params.relatedTo) filtersApplied.push('relations');
  if (context.exclusions && context.exclusions.length > 0) filtersApplied.push('exclusions');

  const filter: FilterStageExplain = {
    beforeCount,
    afterCount,
    filtersApplied,
    durationMs: getStageDuration('filter'),
  };

  const scores = results.map((r) => r.score);
  const topEntries = results.slice(0, 5).map((r) => {
    const components: ScoreComponents = {
      fts: context.ftsScores?.get(r.id),
      semantic: context.semanticScores?.get(r.id),
      final: r.score,
    };
    return {
      id: r.id,
      type: r.type,
      components,
    };
  });

  const score: ScoreStageExplain = {
    factors: getScoringFactors(telemetry.decisions),
    scoreRange: {
      min: scores.length > 0 ? Math.min(...scores) : 0,
      max: scores.length > 0 ? Math.max(...scores) : 0,
    },
    topEntries,
    durationMs: getStageDuration('score'),
  };

  const rerank: RerankStageExplain = {
    used: telemetry.decisions.usedReranking ?? telemetry.decisions.usedCrossEncoder ?? false,
    method: telemetry.decisions.usedCrossEncoder ? 'cross-encoder' : 'embedding',
    durationMs: getStageDuration('rerank'),
  };

  const sortedStages = [...telemetry.stages].sort((a, b) => b.durationMs - a.durationMs);
  const topStage = sortedStages[0];
  const bottleneck =
    topStage && telemetry.totalMs > 0 && topStage.durationMs > telemetry.totalMs * 0.3
      ? topStage.name
      : null;

  const breakdown = telemetry.stages
    .filter((s) => s.durationMs > 0)
    .map((s) => ({
      stage: s.name,
      durationMs: s.durationMs,
      percent: telemetry.totalMs > 0 ? Math.round((s.durationMs / telemetry.totalMs) * 100) : 0,
    }));

  const summary = generateSummary(results, telemetry);

  return {
    summary,
    stages: {
      resolve,
      strategy,
      rewrite,
      hierarchical,
      fts,
      semantic,
      fetch,
      filter,
      score,
      rerank,
    },
    timing: {
      totalMs: telemetry.totalMs,
      breakdown,
      bottleneck,
    },
    cacheHit: context.cacheHit || telemetry.decisions.cacheHit || false,
  };
}

export function createExplainService() {
  return {
    explain: explainQuery,
    explainNested: explainQueryNested,
  };
}

export type ExplainService = ReturnType<typeof createExplainService>;
