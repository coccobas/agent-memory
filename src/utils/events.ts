/**
 * Event Bus for Cache Invalidation
 *
 * Provides a centralized event system for propagating entry changes
 * to cache layers without tight coupling between repositories and caches.
 *
 * The EventBus class implements IEventAdapterExtended for multi-instance
 * cache coordination compatibility.
 */

import type { ScopeType } from '../db/schema.js';
import type { IEventAdapterExtended } from '../core/interfaces/event-adapter.js';
import { createComponentLogger } from './logger.js';

const logger = createComponentLogger('events');

// =============================================================================
// TYPES
// =============================================================================

export type EntryType = 'tool' | 'guideline' | 'knowledge';

export interface EntryChangedEvent {
  entryType: EntryType;
  entryId: string;
  scopeType: ScopeType;
  scopeId: string | null;
  action: 'create' | 'update' | 'delete' | 'deactivate';
}

export type EntryChangedHandler = (event: EntryChangedEvent) => void;

// =============================================================================
// EVENT BUS IMPLEMENTATION
// =============================================================================

/**
 * EventBus implements IEventAdapterExtended for multi-instance
 * cache coordination. This is the local (single-instance) implementation.
 *
 * For distributed deployments, use RedisEventAdapter which provides
 * cross-instance event propagation via Redis pub/sub.
 *
 * Usage: Create via factory, inject via DI, do not use singleton.
 */
export class EventBus implements IEventAdapterExtended {
  private handlers: Set<EntryChangedHandler> = new Set();

  /**
   * Subscribe to entry change events.
   * Returns an unsubscribe function.
   */
  subscribe(handler: EntryChangedHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * Emit an entry changed event to all subscribers.
   */
  emit(event: EntryChangedEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (error) {
        // Don't allow handler failures to cascade, but do log for diagnosability.
        logger.debug(
          {
            event,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
          'EntryChanged handler failed'
        );
      }
    }
  }

  /**
   * Clear all handlers (for testing).
   */
  clear(): void {
    this.handlers.clear();
  }

  /**
   * Get the number of registered handlers.
   */
  subscriberCount(): number {
    return this.handlers.size;
  }

}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new EventBus instance.
 * Use this via dependency injection rather than the singleton.
 */
export function createEventBus(): EventBus {
  return new EventBus();
}
