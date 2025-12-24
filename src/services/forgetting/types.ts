/**
 * Forgetting Service Types
 *
 * Type definitions for memory forgetting and decay.
 */

export type ForgettingStrategy = 'recency' | 'frequency' | 'importance' | 'combined';

export type EntryType = 'tool' | 'guideline' | 'knowledge' | 'experience';

export interface ForgettingCandidate {
  id: string;
  entryType: EntryType;
  name: string;
  scopeType: string;
  scopeId: string | null;
  createdAt: string;
  lastAccessedAt: string | null;
  accessCount: number;
  priority?: number;
  confidence?: number;
  isCritical?: boolean;
  scores: {
    recency: number;
    frequency: number;
    importance: number;
    combined: number;
  };
  reason: string;
}

export interface ForgettingResult {
  success: boolean;
  dryRun: boolean;
  strategy: ForgettingStrategy;
  scopeType: string;
  scopeId?: string;
  stats: {
    analyzed: number;
    candidates: number;
    forgotten: number;
    skipped: number;
    errors: number;
  };
  candidates: ForgettingCandidate[];
  errors?: Array<{ id: string; error: string }>;
  timing: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
}

export interface ForgettingConfig {
  enabled: boolean;
  schedule: string;
  recency: {
    enabled: boolean;
    staleDays: number;
    threshold: number;
  };
  frequency: {
    enabled: boolean;
    minAccessCount: number;
    lookbackDays: number;
  };
  importance: {
    enabled: boolean;
    threshold: number;
  };
  dryRunDefault: boolean;
  maxEntriesPerRun: number;
  excludeCritical: boolean;
  excludeHighPriority: number;
}

export interface AnalyzeParams {
  scopeType: string;
  scopeId?: string;
  entryTypes?: EntryType[];
  strategy?: ForgettingStrategy;
  staleDays?: number;
  minAccessCount?: number;
  importanceThreshold?: number;
  limit?: number;
}

export interface ForgetParams extends AnalyzeParams {
  dryRun?: boolean;
  agentId?: string;
}

export interface ForgettingStatus {
  enabled: boolean;
  schedule: string | null;
  lastRun: {
    at: string | null;
    forgotten: number;
    errors: number;
  } | null;
  config: ForgettingConfig;
}
