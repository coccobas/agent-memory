/**
 * System Event Bus for Memory Pressure Detection
 *
 * Provides an event-driven system for memory pressure detection and response.
 * Unlike the EntryChangedEvent system (cache invalidation), this handles
 * system-level resource events.
 *
 * Features:
 * - Multi-level pressure detection (warning, critical)
 * - Recovery events when pressure subsides
 * - Subscriber management with limits
 * - Statistics tracking
 */

import { createComponentLogger } from './logger.js';

const logger = createComponentLogger('system-events');

// =============================================================================
// TYPES
// =============================================================================

export type MemoryPressureLevel = 'normal' | 'warning' | 'critical';

export interface MemoryPressureEvent {
  type: 'memory_pressure';
  level: MemoryPressureLevel;
  previousLevel: MemoryPressureLevel;
  stats: {
    heapUsedMB: number;
    heapTotalMB: number;
    heapLimitMB: number;
    utilizationPercent: number;
    cacheMemoryMB?: number;
  };
  timestamp: string;
}

export interface MemoryRecoveryEvent {
  type: 'memory_recovery';
  level: MemoryPressureLevel;
  previousLevel: MemoryPressureLevel;
  stats: {
    heapUsedMB: number;
    heapTotalMB: number;
    heapLimitMB: number;
    utilizationPercent: number;
    freedMB?: number;
  };
  timestamp: string;
}

export type SystemEvent = MemoryPressureEvent | MemoryRecoveryEvent;

export type SystemEventHandler<T extends SystemEvent = SystemEvent> = (
  event: T
) => void | Promise<void>;

export interface SystemEventBusStats {
  totalEventsEmitted: number;
  totalHandlersInvoked: number;
  lastEventTimestamp: string | null;
  handlerCount: number;
  pressureEventCount: number;
  recoveryEventCount: number;
}

// =============================================================================
// SYSTEM EVENT BUS IMPLEMENTATION
// =============================================================================

/**
 * System Event Bus for resource-level events.
 *
 * Separate from EntryChangedEvent bus to keep concerns separated:
 * - EntryChangedEvent: Data changes (CRUD) for cache invalidation
 * - SystemEvent: Resource pressure, recovery, system health
 */
export class SystemEventBus {
  private handlers = new Map<string, Set<SystemEventHandler>>();
  private static readonly MAX_HANDLERS_PER_TYPE = 100;
  private stats: SystemEventBusStats = {
    totalEventsEmitted: 0,
    totalHandlersInvoked: 0,
    lastEventTimestamp: null,
    handlerCount: 0,
    pressureEventCount: 0,
    recoveryEventCount: 0,
  };

  /**
   * Subscribe to a specific event type.
   * Returns an unsubscribe function.
   */
  subscribe<T extends SystemEvent>(
    eventType: T['type'],
    handler: SystemEventHandler<T>
  ): () => void {
    let typeHandlers = this.handlers.get(eventType);
    if (!typeHandlers) {
      typeHandlers = new Set();
      this.handlers.set(eventType, typeHandlers);
    }

    if (typeHandlers.size >= SystemEventBus.MAX_HANDLERS_PER_TYPE) {
      logger.warn(
        { eventType, currentCount: typeHandlers.size },
        'SystemEventBus handler limit reached for event type'
      );
      return () => {}; // Return no-op unsubscribe
    }

    typeHandlers.add(handler as SystemEventHandler);
    this.stats.handlerCount++;

    return () => {
      typeHandlers?.delete(handler as SystemEventHandler);
      this.stats.handlerCount = Math.max(0, this.stats.handlerCount - 1);
    };
  }

  /**
   * Subscribe to all system events.
   */
  subscribeAll(handler: SystemEventHandler): () => void {
    const unsubscribers = [
      this.subscribe('memory_pressure', handler),
      this.subscribe('memory_recovery', handler),
    ];

    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
    };
  }

  /**
   * Emit a system event to all subscribers of that event type.
   * Handlers are invoked asynchronously to prevent blocking.
   */
  async emit<T extends SystemEvent>(event: T): Promise<void> {
    const typeHandlers = this.handlers.get(event.type);
    if (!typeHandlers || typeHandlers.size === 0) {
      return;
    }

    this.stats.totalEventsEmitted++;
    this.stats.lastEventTimestamp = event.timestamp;

    if (event.type === 'memory_pressure') {
      this.stats.pressureEventCount++;
    } else if (event.type === 'memory_recovery') {
      this.stats.recoveryEventCount++;
    }

    logger.debug(
      { eventType: event.type, handlerCount: typeHandlers.size },
      'Emitting system event'
    );

    const promises: Promise<void>[] = [];

    for (const handler of typeHandlers) {
      this.stats.totalHandlersInvoked++;
      promises.push(
        (async () => {
          try {
            await handler(event);
          } catch (error) {
            logger.error(
              {
                eventType: event.type,
                error: error instanceof Error ? error.message : String(error),
              },
              'System event handler failed'
            );
          }
        })()
      );
    }

    // Wait for all handlers to complete
    await Promise.allSettled(promises);
  }

  /**
   * Emit without waiting for handlers (fire-and-forget).
   */
  emitAsync<T extends SystemEvent>(event: T): void {
    void this.emit(event);
  }

  /**
   * Clear all handlers (for testing).
   */
  clear(): void {
    this.handlers.clear();
    this.stats.handlerCount = 0;
  }

  /**
   * Get statistics about the event bus.
   */
  getStats(): SystemEventBusStats {
    return { ...this.stats };
  }

  /**
   * Get handler count for a specific event type.
   */
  handlerCount(eventType?: string): number {
    if (eventType) {
      return this.handlers.get(eventType)?.size ?? 0;
    }
    return this.stats.handlerCount;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new SystemEventBus instance.
 */
export function createSystemEventBus(): SystemEventBus {
  return new SystemEventBus();
}

// =============================================================================
// SINGLETON (for convenience, but DI preferred)
// =============================================================================

let defaultSystemEventBus: SystemEventBus | null = null;

/**
 * Get the default system event bus instance.
 * Prefer dependency injection over this singleton.
 */
export function getSystemEventBus(): SystemEventBus {
  if (!defaultSystemEventBus) {
    defaultSystemEventBus = createSystemEventBus();
  }
  return defaultSystemEventBus;
}

/**
 * Reset the default system event bus (for testing).
 */
export function resetSystemEventBus(): void {
  if (defaultSystemEventBus) {
    defaultSystemEventBus.clear();
    defaultSystemEventBus = null;
  }
}
