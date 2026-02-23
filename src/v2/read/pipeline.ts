/**
 * V2 read pipeline.
 *
 * Stage order:
 * 1) resolve strategy
 * 2) collect candidates (FTS/semantic/relation)
 * 3) load entries
 * 4) apply filters
 * 5) rank
 * 6) paginate
 */

import type {
  EntrySnapshot,
  EntryType,
  CandidateHit,
  QueryRequest,
  QueryResponse,
  ReadStageTrace,
  RetrievalResult,
} from '../contracts/index.js';
import type { CandidateRecord } from './contracts.js';
import type {
  CandidateSource,
  EntryFilter,
  EntryRanker,
  EntryReader,
  ReadTraceEmitter,
  StrategyResolver,
} from './ports.js';

export type ReadStageName = ReadStageTrace['name'];

export interface ReadPipelineResult extends QueryResponse {
  trace: ReadStageTrace[];
}

export interface ReadPipelineDeps {
  strategyResolver: StrategyResolver;
  candidateSources: readonly CandidateSource[];
  entryReader: EntryReader;
  filters?: readonly EntryFilter[];
  ranker: EntryRanker;
  traceEmitter?: ReadTraceEmitter;
}

function entryKey(type: EntryType, id: string): string {
  return `${type}:${id}`;
}

function mergeCandidates(hits: readonly CandidateHit[]): CandidateRecord[] {
  const merged = new Map<string, CandidateRecord>();

  for (const hit of hits) {
    const key = entryKey(hit.entryType, hit.entryId);
    const current = merged.get(key);

    if (!current) {
      merged.set(key, {
        key,
        entryType: hit.entryType,
        entryId: hit.entryId,
        channels: new Set([hit.channel]),
        channelScores: {
          [hit.channel]: hit.score,
        },
      });
      continue;
    }

    current.channels.add(hit.channel);
    const priorScore = current.channelScores[hit.channel] ?? Number.NEGATIVE_INFINITY;
    if (hit.score > priorScore) {
      current.channelScores[hit.channel] = hit.score;
    }
  }

  return Array.from(merged.values());
}

async function runTimed<T>(args: {
  name: ReadStageName;
  trace: ReadStageTrace[];
  work: () => Promise<T>;
  detailBuilder?: (value: T) => Record<string, unknown>;
}): Promise<T> {
  const start = Date.now();
  const value = await args.work();
  const details = args.detailBuilder?.(value);
  args.trace.push({
    name: args.name,
    durationMs: Date.now() - start,
    details,
  });
  return value;
}

export class ReadPipeline {
  private readonly strategyResolver: StrategyResolver;
  private readonly candidateSources: readonly CandidateSource[];
  private readonly entryReader: EntryReader;
  private readonly filters: readonly EntryFilter[];
  private readonly ranker: EntryRanker;
  private readonly traceEmitter?: ReadTraceEmitter;

  constructor(deps: ReadPipelineDeps) {
    this.strategyResolver = deps.strategyResolver;
    this.candidateSources = deps.candidateSources;
    this.entryReader = deps.entryReader;
    this.filters = deps.filters ?? [];
    this.ranker = deps.ranker;
    this.traceEmitter = deps.traceEmitter;
  }

  async execute(request: QueryRequest): Promise<ReadPipelineResult> {
    const trace: ReadStageTrace[] = [];

    const strategy = await runTimed({
      name: 'resolve_strategy',
      trace,
      work: () => this.strategyResolver.resolve(request),
      detailBuilder: (value) => ({ strategy: value }),
    });

    const candidateHits = await runTimed({
      name: 'collect_candidates',
      trace,
      work: async () => {
        const batches = await Promise.all(
          this.candidateSources.map((source) => source.fetchCandidates(request, strategy))
        );
        return batches.flatMap((batch) => batch);
      },
      detailBuilder: (value) => ({ hitCount: value.length }),
    });

    const mergedCandidates = mergeCandidates(candidateHits);

    const entries = await runTimed({
      name: 'load_entries',
      trace,
      work: () =>
        this.entryReader.getEntries(
          mergedCandidates.map((candidate) => ({
            type: candidate.entryType,
            id: candidate.entryId,
          }))
        ),
      detailBuilder: (value) => ({ entryCount: value.length }),
    });

    const filteredEntries = await runTimed({
      name: 'filter',
      trace,
      work: async () => {
        let activeEntries = entries;
        for (const filter of this.filters) {
          activeEntries = await filter.apply(activeEntries, request);
        }
        return activeEntries;
      },
      detailBuilder: (value) => ({ entryCount: value.length }),
    });

    const entriesByKey = new Map<string, EntrySnapshot>();
    for (const entry of filteredEntries) {
      entriesByKey.set(entryKey(entry.ref.type, entry.ref.id), entry);
    }

    const rankInputCandidates = mergedCandidates.filter((candidate) =>
      entriesByKey.has(candidate.key)
    );

    const ranked = await runTimed({
      name: 'rank',
      trace,
      work: () =>
        this.ranker.rank({
          request,
          candidates: rankInputCandidates,
          entriesByKey,
        }),
      detailBuilder: (value) => ({ resultCount: value.length }),
    });

    const budgeted =
      request.tokenBudget != null
        ? await runTimed({
            name: 'budget_truncate',
            trace,
            work: async () => truncateByTokenBudget(ranked, request.tokenBudget!),
            detailBuilder: (value) => ({
              resultCount: value.length,
              tokenBudget: request.tokenBudget,
            }),
          })
        : ranked;

    const paged = await runTimed({
      name: 'paginate',
      trace,
      work: async () => paginateResults(budgeted, request.offset ?? 0, request.limit),
      detailBuilder: (value) => ({ returnedCount: value.length }),
    });

    const result: ReadPipelineResult = {
      results: paged,
      totalCount: budgeted.length,
      trace,
      strategy,
    };

    if (this.traceEmitter) {
      try {
        this.traceEmitter.emit({
          request,
          resultCount: paged.length,
          entryIdsReturned: paged.map((r) => r.entry.ref.id),
          trace,
          timestamp: new Date().toISOString(),
        });
      } catch {
        // Fire-and-forget: trace emission must never block or fail the read path.
      }
    }

    return result;
  }
}

function estimateTokens(entry: { title: string; content: string }): number {
  return Math.ceil((entry.title.length + entry.content.length) / 4);
}

function truncateByTokenBudget(
  results: readonly RetrievalResult[],
  budget: number
): RetrievalResult[] {
  const output: RetrievalResult[] = [];
  let accumulated = 0;

  for (const result of results) {
    const tokens = estimateTokens(result.entry);
    if (accumulated + tokens > budget && output.length > 0) {
      break;
    }
    accumulated += tokens;
    output.push(result);
  }

  return output;
}

async function paginateResults(
  results: readonly RetrievalResult[],
  offset: number,
  limit: number
): Promise<RetrievalResult[]> {
  const normalizedOffset = Math.max(0, Math.floor(offset));
  const normalizedLimit = Math.max(0, Math.floor(limit));
  return results.slice(normalizedOffset, normalizedOffset + normalizedLimit);
}
