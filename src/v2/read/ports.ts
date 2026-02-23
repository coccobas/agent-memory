/**
 * Read-plane dependency ports.
 *
 * Each port maps to a replaceable implementation for a clean architecture:
 * - Candidate sources: FTS, vector, relation traversal
 * - Entry reader: primary store fetch
 * - Filters: tags/scopes/permissions
 * - Ranker: final score synthesis
 */

import type {
  EntrySnapshot,
  EntryType,
  CandidateHit,
  QueryRequest,
  ReadStageTrace,
  RetrievalChannel,
  RetrievalResult,
  RetrievalStrategy,
} from '../contracts/index.js';
import type { CandidateRecord } from './contracts.js';

export interface StrategyResolver {
  resolve(request: QueryRequest): Promise<RetrievalStrategy>;
}

export interface CandidateSource {
  channel: RetrievalChannel;
  fetchCandidates(
    request: QueryRequest,
    strategy: RetrievalStrategy
  ): Promise<readonly CandidateHit[]>;
}

export interface EntryReader {
  getEntries(refs: readonly { type: EntryType; id: string }[]): Promise<readonly EntrySnapshot[]>;
}

export interface EntryFilter {
  apply(
    entries: readonly EntrySnapshot[],
    request: QueryRequest
  ): Promise<readonly EntrySnapshot[]>;
}

export interface EntryRanker {
  rank(input: {
    request: QueryRequest;
    candidates: readonly CandidateRecord[];
    entriesByKey: ReadonlyMap<string, EntrySnapshot>;
  }): Promise<readonly RetrievalResult[]>;
}

export interface ReadTraceEvent {
  correlationId?: string;
  request: QueryRequest;
  resultCount: number;
  entryIdsReturned: string[];
  trace: ReadStageTrace[];
  timestamp: string;
}

export interface ReadTraceEmitter {
  emit(trace: ReadTraceEvent): void;
}
