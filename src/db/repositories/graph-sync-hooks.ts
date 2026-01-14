/**
 * Graph Sync Hooks
 *
 * Module-level hook for graph synchronization to avoid circular dependencies
 * between repositories and services. Repositories call syncEntryToNodeAsync()
 * which uses a registered GraphSyncService instance.
 *
 * Pattern inspired by embedding-hooks.ts for async non-fatal operations.
 */

import type { GraphSyncService, EntrySyncMetadata, RelationSyncMetadata } from '../../services/graph/sync.service.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('graph-sync-hooks');

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

  // Fire and forget - don't block repository operation
  void graphSyncService
    .syncEntryToNode(metadata)
    .then((node) => {
      if (node) {
        logger.debug(
          { entryType: metadata.entryType, entryId: metadata.entryId, nodeId: node.id },
          'Entry synced to graph node'
        );
      }
    })
    .catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(
        { entryType: metadata.entryType, entryId: metadata.entryId, error: errorMessage },
        'Failed to sync entry to graph node (non-fatal)'
      );
    });
}

/**
 * Synchronize a relation to a graph edge (fire-and-forget).
 * Called by relation repository after relation creation.
 *
 * Non-fatal: Logs errors but doesn't fail the main operation.
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

  // Fire and forget - don't block repository operation
  void graphSyncService
    .syncRelationToEdge(metadata)
    .then((edge) => {
      if (edge) {
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
