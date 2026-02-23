export interface QueryStageTraceMetric {
  name: 'resolve_strategy' | 'collect_candidates' | 'load_entries' | 'filter' | 'rank' | 'paginate';
  durationMs: number;
  details?: Record<string, unknown>;
}

export interface OutboxLagMetrics {
  pendingCount: number;
  oldestPendingAgeMs: number;
}

export interface ProjectorMetrics {
  projectorName: string;
  checkpointSeq: number;
  latestSeq: number;
  lag: number;
  failedCount: number;
  retryCount: number;
  lastError?: string;
}

export interface QueryMetrics {
  traces: QueryStageTraceMetric[];
  channelContribution: Record<string, number>;
  fallbackHits: number;
}
