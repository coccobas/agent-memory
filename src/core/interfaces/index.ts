/**
 * Core Interfaces
 *
 * Public exports for all core interface definitions.
 */

// Event adapter interface
export type {
  IEventAdapter,
  IEventAdapterExtended,
  EntryEventAdapter,
  EntryChangedEvent,
  EntryChangedHandler,
} from './event-adapter.js';

// Repository interfaces
export * from './repositories.js';

// Vector store interface
export * from './vector-store.js';

// Vector service interface
export * from './vector.service.js';
