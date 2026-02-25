/**
 * Canonical V2 query contracts.
 */

import type { EntrySnapshot, EntrySource, EntryType, ScopeRef } from './entry.js';
import type { RelationType } from './relation.js';

export type RetrievalStrategy = 'fts' | 'semantic' | 'hybrid';

export type RetrievalChannel = 'fts' | 'semantic' | 'relation' | 'primary';

export interface QueryRequest {
  query?: string;
  scope: ScopeRef;
  types?: EntryType[];
  sources?: EntrySource[];
  limit: number;
  offset?: number;
  tags?: {
    include?: string[];
    require?: string[];
    exclude?: string[];
  };
  relatedTo?: {
    entryType: EntryType;
    entryId: string;
    relationType?: RelationType;
    depth?: number;
  };
  strategy?: RetrievalStrategy;
  includeInactive?: boolean;
  queryEmbedding?: number[];
  tokenBudget?: number;
}

export interface CandidateHit {
  entryType: EntryType;
  entryId: string;
  channel: RetrievalChannel;
  score: number;
}

export interface RetrievalResult {
  entry: EntrySnapshot;
  score: number;
  reasons: string[];
}

export interface ReadStageTrace {
  name:
    | 'resolve_strategy'
    | 'collect_candidates'
    | 'load_entries'
    | 'filter'
    | 'rank'
    | 'budget_truncate'
    | 'paginate';
  durationMs: number;
  details?: Record<string, unknown>;
}

export interface QueryResponse {
  results: RetrievalResult[];
  totalCount: number;
  trace: ReadStageTrace[];
  strategy: RetrievalStrategy;
}
