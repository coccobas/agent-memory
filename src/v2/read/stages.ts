/**
 * Minimal default read-stage implementations for V2 bootstrapping.
 */

import type {
  EntrySnapshot,
  QueryRequest,
  RetrievalChannel,
  RetrievalResult,
  RetrievalStrategy,
} from '../contracts/index.js';
import type { CandidateRecord } from './contracts.js';
import type { EntryFilter, EntryRanker, StrategyResolver } from './ports.js';

const DEFAULT_CHANNEL_WEIGHTS = {
  fts: 1,
  semantic: 1,
  relation: 0.6,
  primary: 0,
} satisfies Record<RetrievalChannel, number>;

const SCOPE_WEIGHT = 0.4;

const SCOPE_LEVEL: Record<EntrySnapshot['scope']['type'], number> = {
  global: 1,
  org: 2,
  project: 3,
  session: 4,
};

function scopeProximityScore(entry: EntrySnapshot, request: QueryRequest): number {
  if (entry.scope.type === request.scope.type && entry.scope.id === request.scope.id) {
    return 1;
  }

  if (entry.scope.type === 'global') {
    return 0.5;
  }

  if (entry.scope.type === request.scope.type) {
    return 0.35;
  }

  const entryLevel = SCOPE_LEVEL[entry.scope.type];
  const requestLevel = SCOPE_LEVEL[request.scope.type];
  const distance = Math.abs(requestLevel - entryLevel);
  return Math.max(0.1, 0.6 - distance * 0.15);
}

function scopeSpecificity(entry: EntrySnapshot): number {
  return SCOPE_LEVEL[entry.scope.type];
}

function parseDateMs(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export class StaticStrategyResolver implements StrategyResolver {
  async resolve(request: QueryRequest): Promise<RetrievalStrategy> {
    if (request.strategy) {
      return request.strategy;
    }
    if (request.query && request.query.trim().length > 0) {
      return 'hybrid';
    }
    return 'fts';
  }
}

export class SimpleTagFilter implements EntryFilter {
  async apply(
    entries: readonly EntrySnapshot[],
    request: QueryRequest
  ): Promise<readonly EntrySnapshot[]> {
    const include = new Set((request.tags?.include ?? []).map((tag) => tag.toLowerCase()));
    const require = new Set((request.tags?.require ?? []).map((tag) => tag.toLowerCase()));
    const exclude = new Set((request.tags?.exclude ?? []).map((tag) => tag.toLowerCase()));

    if (include.size === 0 && require.size === 0 && exclude.size === 0) {
      return entries;
    }

    return entries.filter((entry) => {
      const entryTags = new Set(entry.tags.map((tag) => tag.toLowerCase()));

      for (const tag of exclude) {
        if (entryTags.has(tag)) return false;
      }

      for (const tag of require) {
        if (!entryTags.has(tag)) return false;
      }

      if (include.size > 0) {
        for (const tag of include) {
          if (entryTags.has(tag)) return true;
        }
        return false;
      }

      return true;
    });
  }
}

export class WeightedChannelRanker implements EntryRanker {
  async rank(input: {
    request: QueryRequest;
    candidates: readonly CandidateRecord[];
    entriesByKey: ReadonlyMap<string, EntrySnapshot>;
  }): Promise<readonly RetrievalResult[]> {
    const scored: Array<RetrievalResult & { scopeSpecificity: number; updatedAtMs: number }> = [];

    for (const candidate of input.candidates) {
      const entry = input.entriesByKey.get(candidate.key);
      if (!entry) continue;

      let score = 0;
      const reasons: string[] = [];

      for (const channel of candidate.channels) {
        const channelScore = candidate.channelScores[channel] ?? 0;
        const weight = DEFAULT_CHANNEL_WEIGHTS[channel];
        score += channelScore * weight;
        if (channel !== 'primary' && channelScore > 0) {
          reasons.push(`${channel}:${channelScore.toFixed(2)}`);
        }
      }

      const scopeScore = scopeProximityScore(entry, input.request);
      score += scopeScore * SCOPE_WEIGHT;
      reasons.push(`scope:${entry.scope.type}`);

      scored.push({
        entry,
        score,
        reasons,
        scopeSpecificity: scopeSpecificity(entry),
        updatedAtMs: parseDateMs(entry.updatedAt),
      });
    }

    scored.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (right.scopeSpecificity !== left.scopeSpecificity) {
        return right.scopeSpecificity - left.scopeSpecificity;
      }

      if (right.updatedAtMs !== left.updatedAtMs) {
        return right.updatedAtMs - left.updatedAtMs;
      }

      return left.entry.ref.id.localeCompare(right.entry.ref.id);
    });

    return scored.map(({ entry, score, reasons }) => ({ entry, score, reasons }));
  }
}
