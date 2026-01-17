/**
 * Graph Backfill Types
 *
 * Type definitions for the graph backfill service that automatically
 * populates the knowledge graph with nodes and edges for existing entries.
 */

import type { ScopeType } from '../../db/schema.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Graph backfill service configuration
 */
export interface GraphBackfillConfig {
  /** Enable the backfill service */
  enabled: boolean;

  /** Cron schedule for automatic backfill (e.g., "0 6 * * *" for 6am daily) */
  schedule?: string;

  /** Trigger backfill on session end */
  triggerOnSessionEnd: boolean;

  /** Batch size for processing entries */
  batchSize: number;

  /** Maximum entries to process per run (0 = unlimited) */
  maxEntriesPerRun: number;

  /** Include entries from parent scopes when backfilling a project */
  includeInheritedScopes: boolean;
}

/**
 * Default graph backfill configuration
 */
export const DEFAULT_GRAPH_BACKFILL_CONFIG: GraphBackfillConfig = {
  enabled: true,
  schedule: '0 6 * * *', // Daily at 6am (after librarian at 5am)
  triggerOnSessionEnd: true,
  batchSize: 50,
  maxEntriesPerRun: 500,
  includeInheritedScopes: false,
};

// =============================================================================
// BACKFILL TYPES
// =============================================================================

/**
 * Backfill request parameters
 */
export interface BackfillRequest {
  /** Target scope for backfill */
  scopeType?: ScopeType;
  /** Target scope ID */
  scopeId?: string;
  /** Override default batch size */
  batchSize?: number;
  /** Override max entries per run */
  maxEntries?: number;
  /** Dry run (don't create nodes/edges) */
  dryRun?: boolean;
  /** Backfill run ID for tracking */
  runId?: string;
  /** Initiated by */
  initiatedBy?: string;
}

/**
 * Statistics for a single entry type backfill
 */
export interface EntryTypeStats {
  /** Total entries scanned */
  total: number;
  /** Entries that already have nodes */
  existing: number;
  /** New nodes created */
  created: number;
  /** Failed to create */
  failed: number;
}

/**
 * Full backfill result
 */
export interface BackfillResult {
  /** Unique backfill run ID */
  runId: string;
  /** Request parameters */
  request: BackfillRequest;
  /** Statistics by entry type */
  stats: {
    knowledge: EntryTypeStats;
    guideline: EntryTypeStats;
    tool: EntryTypeStats;
    experience: EntryTypeStats;
    edges: EntryTypeStats;
  };
  /** Timing information */
  timing: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
  /** Was this a dry run? */
  dryRun: boolean;
  /** Total nodes created */
  totalNodesCreated: number;
  /** Total edges created */
  totalEdgesCreated: number;
  /** Any errors encountered */
  errors?: string[];
}

// =============================================================================
// SERVICE STATUS
// =============================================================================

/**
 * Graph backfill service status
 */
export interface GraphBackfillStatus {
  /** Is the service enabled */
  enabled: boolean;
  /** Is the scheduler running */
  schedulerRunning: boolean;
  /** Current schedule (cron expression) */
  schedule?: string;
  /** Next scheduled run */
  nextRun?: string;
  /** Last backfill result summary */
  lastBackfill?: {
    runId: string;
    completedAt: string;
    totalNodesCreated: number;
    totalEdgesCreated: number;
    durationMs: number;
  };
  /** Current configuration */
  config: GraphBackfillConfig;
}
