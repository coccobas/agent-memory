/**
 * Graph Services - Index
 *
 * Exports graph-related services (type registry, sync, backfill).
 */

// Type registry
export { createTypeRegistry } from './type-registry.service.js';
export { BUILTIN_NODE_TYPES, BUILTIN_EDGE_TYPES } from './builtin-types.js';
export type { BuiltinNodeTypeDef, BuiltinEdgeTypeDef } from './builtin-types.js';

// Graph sync service
export { GraphSyncService, createGraphSyncService } from './sync.service.js';
export type { EntrySyncMetadata, RelationSyncMetadata } from './sync.service.js';

// Graph backfill service
export { GraphBackfillService, createGraphBackfillService } from './backfill.service.js';
export type {
  GraphBackfillConfig,
  BackfillRequest,
  BackfillResult,
  EntryTypeStats,
  GraphBackfillStatus,
} from './backfill-types.js';
export { DEFAULT_GRAPH_BACKFILL_CONFIG } from './backfill-types.js';

// Graph backfill scheduler
export {
  startGraphBackfillScheduler,
  stopGraphBackfillScheduler,
  getGraphBackfillSchedulerStatus,
  triggerImmediateBackfill,
  isGraphBackfillSchedulerRunning,
} from './backfill-scheduler.service.js';
export type {
  GraphBackfillSchedulerConfig,
  GraphBackfillSchedulerStatus,
} from './backfill-scheduler.service.js';
