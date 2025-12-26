/**
 * Event Adapter Interface
 *
 * Defines the contract for event adapters used in multi-instance
 * cache coordination. Implementations include:
 * - EventBus (local single-instance)
 * - RedisEventAdapter (uses Redis pub/sub for multi-instance)
 */

import type { EntryChangedEvent, EntryChangedHandler } from '../../utils/events.js';

// Re-export event types for convenience
export type { EntryChangedEvent, EntryChangedHandler };

/**
 * Abstract event adapter interface for cache invalidation events.
 *
 * This interface enables multi-instance cache coordination by abstracting
 * the event transport mechanism. Single-instance deployments can use
 * the local EventBus, while horizontally scaled deployments can use
 * Redis pub/sub or similar distributed messaging.
 *
 * The base interface defines the minimal contract required for
 * event-driven cache coordination.
 */
export interface IEventAdapter {
  /**
   * Subscribe to entry change events.
   * @param handler - Function to call when an event is received
   * @returns Unsubscribe function to remove the handler
   */
  subscribe(handler: EntryChangedHandler): () => void;

  /**
   * Emit an entry changed event.
   * @param event - The event to emit to all subscribers
   */
  emit(event: EntryChangedEvent): void;
}

/**
 * Extended event adapter interface with additional capabilities.
 *
 * Includes methods for testing, monitoring, and resource management
 * that are useful but not strictly required for basic event coordination.
 */
export interface IEventAdapterExtended extends IEventAdapter {
  /**
   * Clear all handlers (primarily for testing).
   */
  clear(): void;

  /**
   * Get the number of registered handlers.
   */
  subscriberCount(): number;
}

/**
 * Type alias for entry-change-specific event adapter.
 * This is the most common usage pattern.
 */
export type EntryEventAdapter = IEventAdapterExtended;
