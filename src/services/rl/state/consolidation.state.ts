/**
 * Consolidation State Builder
 *
 * Builds state features for consolidation policy from entry groups.
 */

import type { ConsolidationState } from '../types.js';
import type { ScopeType, EntryType } from '../../../db/schema.js';

// =============================================================================
// STATE BUILDER
// =============================================================================

export interface ConsolidationStateParams {
  group: {
    entries: Array<{
      id: string;
      type: EntryType;
      similarity: number;
    }>;
    avgSimilarity: number;
  };
  usageStats: {
    totalRetrievals: number;
    avgRetrievalRank: number;
    successCount: number;
    failureCount: number;
    lastAccessedAt?: string;
  };
  scopeContext: {
    scopeType: ScopeType;
    totalEntriesInScope: number;
    duplicateCount: number;
  };
}

/**
 * Build consolidation state from entry group
 */
export function buildConsolidationState(params: ConsolidationStateParams): ConsolidationState {
  const { group, usageStats, scopeContext } = params;

  // Group features
  const groupFeatures = extractGroupFeatures(group);

  // Usage stats
  const usageFeatures = extractUsageFeatures(usageStats);

  // Scope stats
  const scopeStats = {
    scopeType: scopeContext.scopeType,
    totalEntriesInScope: scopeContext.totalEntriesInScope,
    duplicateRatio:
      scopeContext.totalEntriesInScope > 0
        ? scopeContext.duplicateCount / scopeContext.totalEntriesInScope
        : 0,
  };

  return {
    groupFeatures,
    usageStats: usageFeatures,
    scopeStats,
  };
}

// =============================================================================
// FEATURE EXTRACTION
// =============================================================================

/**
 * Extract features from entry group
 */
function extractGroupFeatures(group: {
  entries: Array<{ id: string; type: EntryType; similarity: number }>;
  avgSimilarity: number;
}): ConsolidationState['groupFeatures'] {
  const groupSize = group.entries.length;

  // Similarity metrics
  const similarities = group.entries.map((e) => e.similarity);
  const minSimilarity = Math.min(...similarities);
  const maxSimilarity = Math.max(...similarities);
  const avgSimilarity = group.avgSimilarity;

  // Entry types
  const entryTypes = group.entries.map((e) => e.type);
  const uniqueTypes = Array.from(new Set(entryTypes));

  return {
    groupSize,
    avgSimilarity,
    minSimilarity,
    maxSimilarity,
    entryTypes: uniqueTypes,
  };
}

/**
 * Extract usage features from stats
 */
function extractUsageFeatures(usageStats: {
  totalRetrievals: number;
  avgRetrievalRank: number;
  successCount: number;
  failureCount: number;
  lastAccessedAt?: string;
}): ConsolidationState['usageStats'] {
  const totalRetrievals = usageStats.totalRetrievals;
  const avgRetrievalRank = usageStats.avgRetrievalRank;

  // Compute success rate
  const totalOutcomes = usageStats.successCount + usageStats.failureCount;
  const successRate = totalOutcomes > 0 ? usageStats.successCount / totalOutcomes : 0;

  // Compute days since last access
  const lastAccessedDaysAgo = computeDaysSinceLastAccess(usageStats.lastAccessedAt);

  return {
    totalRetrievals,
    avgRetrievalRank,
    successRate,
    lastAccessedDaysAgo,
  };
}

/**
 * Compute days since last access
 */
function computeDaysSinceLastAccess(lastAccessedAt?: string): number {
  if (!lastAccessedAt) {
    return 999; // Never accessed
  }

  const lastAccess = new Date(lastAccessedAt);
  const now = new Date();
  const diffMs = now.getTime() - lastAccess.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return diffDays;
}
