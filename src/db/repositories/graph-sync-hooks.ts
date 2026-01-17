/**
 * Graph Sync Hooks
 *
 * Module-level hook for graph synchronization to avoid circular dependencies
 * between repositories and services. Repositories call syncEntryToNodeAsync()
 * which uses a registered GraphSyncService instance.
 *
 * Pattern inspired by embedding-hooks.ts for async non-fatal operations.
 */

import type {
  GraphSyncService,
  EntrySyncMetadata,
  RelationSyncMetadata,
} from '../../services/graph/sync.service.js';
import { createComponentLogger } from '../../utils/logger.js';
import { getGraphSyncDLQ } from '../../utils/dead-letter-queue.js';

const logger = createComponentLogger('graph-sync-hooks');

// =============================================================================
// ERROR TRACKING & STATS
// =============================================================================

interface GraphSyncStats {
  /** Total node syncs attempted */
  nodeSyncsAttempted: number;
  /** Successful node syncs */
  nodeSyncsSucceeded: number;
  /** Failed node syncs (sent to DLQ) */
  nodeSyncsFailed: number;
  /** Total edge syncs attempted */
  edgeSyncsAttempted: number;
  /** Successful edge syncs */
  edgeSyncsSucceeded: number;
  /** Failed edge syncs (sent to DLQ) */
  edgeSyncsFailed: number;
}

const stats: GraphSyncStats = {
  nodeSyncsAttempted: 0,
  nodeSyncsSucceeded: 0,
  nodeSyncsFailed: 0,
  edgeSyncsAttempted: 0,
  edgeSyncsSucceeded: 0,
  edgeSyncsFailed: 0,
};

/**
 * Get current graph sync statistics for monitoring
 */
export function getGraphSyncStats(): GraphSyncStats {
  return { ...stats };
}

/**
 * Reset stats (for testing)
 * @internal
 */
export function resetGraphSyncStatsForTests(): void {
  stats.nodeSyncsAttempted = 0;
  stats.nodeSyncsSucceeded = 0;
  stats.nodeSyncsFailed = 0;
  stats.edgeSyncsAttempted = 0;
  stats.edgeSyncsSucceeded = 0;
  stats.edgeSyncsFailed = 0;
}

/**
 * Module-level reference to the graph sync service.
 * Registered at application startup by the service factory.
 */
let graphSyncService: GraphSyncService | null = null;

/**
 * Configuration for graph sync hooks.
 * Controlled by config.graph settings.
 */
let graphSyncConfig = {
  autoSync: true,
  captureEnabled: true,
};

/**
 * Register the graph sync service with this module.
 * Called once during application initialization.
 *
 * @param service - The GraphSyncService instance to use for sync operations
 * @param config - Configuration for graph sync behavior
 */
export function registerGraphSyncService(
  service: GraphSyncService | null,
  config?: { autoSync?: boolean; captureEnabled?: boolean }
): void {
  graphSyncService = service;
  if (config) {
    graphSyncConfig = { ...graphSyncConfig, ...config };
  }

  if (service) {
    logger.info(
      { autoSync: graphSyncConfig.autoSync, captureEnabled: graphSyncConfig.captureEnabled },
      'Graph sync service registered with graph-sync-hooks module'
    );
  } else {
    logger.info('Graph sync service cleared from graph-sync-hooks module');
  }
}

/**
 * Synchronize an entry to a graph node (fire-and-forget).
 * Called by repositories after entry creation.
 *
 * Non-fatal: Logs errors but doesn't fail the main operation.
 * Failed operations are tracked in stats and sent to Dead Letter Queue.
 *
 * @param metadata - Entry metadata for node creation
 */
export function syncEntryToNodeAsync(metadata: EntrySyncMetadata): void {
  if (!graphSyncService) {
    logger.debug('Graph sync service not available, skipping node sync');
    return;
  }

  if (!graphSyncConfig.autoSync) {
    logger.debug('Graph auto-sync disabled, skipping node sync');
    return;
  }

  stats.nodeSyncsAttempted++;

  // Fire and forget - don't block repository operation
  void graphSyncService
    .syncEntryToNode(metadata)
    .then((node) => {
      if (node) {
        stats.nodeSyncsSucceeded++;
        logger.debug(
          { entryType: metadata.entryType, entryId: metadata.entryId, nodeId: node.id },
          'Entry synced to graph node'
        );
      }
    })
    .catch((error) => {
      stats.nodeSyncsFailed++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(
        { entryType: metadata.entryType, entryId: metadata.entryId, error: errorMessage },
        'Failed to sync entry to graph node (non-fatal)'
      );

      // Add to Dead Letter Queue for potential retry/analysis
      getGraphSyncDLQ().add({
        type: 'sync',
        operation: 'syncEntryToNode',
        payload: {
          entryType: metadata.entryType,
          entryId: metadata.entryId,
          name: metadata.name,
        },
        error: errorMessage,
        metadata: {
          scopeType: metadata.scopeType,
          scopeId: metadata.scopeId,
        },
      });
    });
}

/**
 * Synchronize a relation to a graph edge (fire-and-forget).
 * Called by relation repository after relation creation.
 *
 * Non-fatal: Logs errors but doesn't fail the main operation.
 * Failed operations are tracked in stats and sent to Dead Letter Queue.
 *
 * @param metadata - Relation metadata for edge creation
 */
export function syncRelationToEdgeAsync(metadata: RelationSyncMetadata): void {
  if (!graphSyncService) {
    logger.debug('Graph sync service not available, skipping edge sync');
    return;
  }

  if (!graphSyncConfig.captureEnabled) {
    logger.debug('Graph capture disabled, skipping edge sync');
    return;
  }

  stats.edgeSyncsAttempted++;

  // Fire and forget - don't block repository operation
  void graphSyncService
    .syncRelationToEdge(metadata)
    .then((edge) => {
      if (edge) {
        stats.edgeSyncsSucceeded++;
        logger.debug(
          {
            relationType: metadata.relationType,
            sourceId: metadata.sourceEntryId,
            targetId: metadata.targetEntryId,
            edgeId: edge.id,
          },
          'Relation synced to graph edge'
        );
      }
    })
    .catch((error) => {
      stats.edgeSyncsFailed++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(
        {
          relationType: metadata.relationType,
          sourceId: metadata.sourceEntryId,
          targetId: metadata.targetEntryId,
          error: errorMessage,
        },
        'Failed to sync relation to graph edge (non-fatal)'
      );

      // Add to Dead Letter Queue for potential retry/analysis
      getGraphSyncDLQ().add({
        type: 'sync',
        operation: 'syncRelationToEdge',
        payload: {
          relationType: metadata.relationType,
          sourceEntryId: metadata.sourceEntryId,
          targetEntryId: metadata.targetEntryId,
        },
        error: errorMessage,
        metadata: {
          sourceEntryType: metadata.sourceEntryType,
          targetEntryType: metadata.targetEntryType,
        },
      });
    });
}

/**
 * Test utility to reset graph sync service for unit tests.
 * @internal
 */
export function resetGraphSyncForTests(): void {
  graphSyncService = null;
  graphSyncConfig = {
    autoSync: true,
    captureEnabled: true,
  };
}
