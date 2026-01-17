/**
 * Memory Pressure Response Service
 *
 * Subscribes to memory pressure events and coordinates automatic responses:
 * - Cache eviction on warning/critical pressure
 * - Forgetting service trigger on critical pressure
 * - Consolidation suggestions on sustained pressure
 *
 * This service bridges the event-driven memory pressure detection system
 * with the various memory management services.
 */

import { createComponentLogger } from '../../utils/logger.js';
import type { MemoryCoordinator } from '../../core/memory-coordinator.js';
import type { IForgettingService } from '../forgetting/index.js';
import type {
  SystemEventBus,
  MemoryPressureEvent,
  MemoryRecoveryEvent,
} from '../../utils/system-events.js';
import { config } from '../../config/index.js';

const logger = createComponentLogger('memory-pressure-response');

// =============================================================================
// TYPES
// =============================================================================

export interface MemoryPressureResponseConfig {
  /** Automatically evict cache on warning/critical pressure */
  autoEvictOnPressure: boolean;
  /** Automatically run forgetting on critical pressure */
  autoForgetOnCritical: boolean;
  /** Scope type for forgetting operations */
  forgettingScopeType?: 'global' | 'org' | 'project' | 'session';
  /** Scope ID for forgetting operations */
  forgettingScopeId?: string;
  /** Max entries to forget per pressure event */
  maxForgetEntriesPerEvent: number;
}

export interface MemoryPressureResponseStats {
  evictionsTriggered: number;
  forgettingsTriggered: number;
  lastPressureEvent: string | null;
  lastRecoveryEvent: string | null;
  currentPressureLevel: 'normal' | 'warning' | 'critical';
}

export interface MemoryPressureResponseDeps {
  systemEventBus: SystemEventBus;
  memoryCoordinator?: MemoryCoordinator;
  forgettingService?: IForgettingService;
}

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

const DEFAULT_CONFIG: MemoryPressureResponseConfig = {
  autoEvictOnPressure: config.memory?.autoEvictOnPressure ?? true,
  autoForgetOnCritical: config.memory?.autoForgetOnCritical ?? false,
  maxForgetEntriesPerEvent: 50,
};

/**
 * Create the Memory Pressure Response Service
 */
export function createMemoryPressureResponseService(
  deps: MemoryPressureResponseDeps,
  serviceConfig: Partial<MemoryPressureResponseConfig> = {}
) {
  const { systemEventBus, memoryCoordinator, forgettingService } = deps;
  const resolvedConfig: MemoryPressureResponseConfig = {
    ...DEFAULT_CONFIG,
    ...serviceConfig,
  };

  const stats: MemoryPressureResponseStats = {
    evictionsTriggered: 0,
    forgettingsTriggered: 0,
    lastPressureEvent: null,
    lastRecoveryEvent: null,
    currentPressureLevel: 'normal',
  };

  let isForgetInProgress = false;
  const unsubscribers: Array<() => void> = [];

  /**
   * Handle memory pressure events
   */
  async function handlePressureEvent(event: MemoryPressureEvent): Promise<void> {
    stats.lastPressureEvent = event.timestamp;
    stats.currentPressureLevel = event.level;

    logger.warn(
      {
        level: event.level,
        previousLevel: event.previousLevel,
        utilizationPercent: event.stats.utilizationPercent,
      },
      `Memory pressure event: ${event.level}`
    );

    // Trigger cache eviction on any pressure
    if (resolvedConfig.autoEvictOnPressure && memoryCoordinator) {
      try {
        logger.info('Triggering cache eviction due to memory pressure');
        memoryCoordinator.evictIfNeeded();
        stats.evictionsTriggered++;
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Cache eviction failed'
        );
      }
    }

    // Trigger forgetting on critical pressure
    if (
      event.level === 'critical' &&
      resolvedConfig.autoForgetOnCritical &&
      forgettingService &&
      !isForgetInProgress
    ) {
      isForgetInProgress = true;
      try {
        logger.info('Triggering forgetting service due to critical memory pressure');

        const result = await forgettingService.forget({
          scopeType: resolvedConfig.forgettingScopeType ?? 'global',
          scopeId: resolvedConfig.forgettingScopeId,
          strategy: 'combined',
          limit: resolvedConfig.maxForgetEntriesPerEvent,
          dryRun: false,
          agentId: 'memory-pressure-response',
        });

        stats.forgettingsTriggered++;
        logger.info(
          {
            forgotten: result.stats.forgotten,
            skipped: result.stats.skipped,
            errors: result.stats.errors,
          },
          'Forgetting completed due to memory pressure'
        );
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Forgetting service failed'
        );
      } finally {
        isForgetInProgress = false;
      }
    }
  }

  /**
   * Handle memory recovery events
   */
  function handleRecoveryEvent(event: MemoryRecoveryEvent): void {
    stats.lastRecoveryEvent = event.timestamp;
    stats.currentPressureLevel = event.level;

    logger.info(
      {
        level: event.level,
        previousLevel: event.previousLevel,
        utilizationPercent: event.stats.utilizationPercent,
      },
      `Memory pressure recovered to ${event.level}`
    );
  }

  return {
    /**
     * Start listening for memory pressure events
     */
    start(): void {
      if (unsubscribers.length > 0) {
        logger.warn('Memory pressure response service already started');
        return;
      }

      // Subscribe to pressure events
      const pressureUnsub = systemEventBus.subscribe<MemoryPressureEvent>(
        'memory_pressure',
        (event) => void handlePressureEvent(event)
      );
      unsubscribers.push(pressureUnsub);

      // Subscribe to recovery events
      const recoveryUnsub = systemEventBus.subscribe<MemoryRecoveryEvent>(
        'memory_recovery',
        handleRecoveryEvent
      );
      unsubscribers.push(recoveryUnsub);

      logger.info(
        {
          autoEvictOnPressure: resolvedConfig.autoEvictOnPressure,
          autoForgetOnCritical: resolvedConfig.autoForgetOnCritical,
        },
        'Memory pressure response service started'
      );
    },

    /**
     * Stop listening for events
     */
    stop(): void {
      for (const unsub of unsubscribers) {
        unsub();
      }
      unsubscribers.length = 0;
      logger.info('Memory pressure response service stopped');
    },

    /**
     * Get current statistics
     */
    getStats(): MemoryPressureResponseStats {
      return { ...stats };
    },

    /**
     * Get configuration
     */
    getConfig(): MemoryPressureResponseConfig {
      return { ...resolvedConfig };
    },

    /**
     * Manually trigger eviction (for testing or manual intervention)
     */
    triggerEviction(): void {
      if (memoryCoordinator) {
        memoryCoordinator.evictIfNeeded();
        stats.evictionsTriggered++;
      }
    },

    /**
     * Manually trigger forgetting (for testing or manual intervention)
     */
    async triggerForgetting(): Promise<void> {
      if (forgettingService && !isForgetInProgress) {
        isForgetInProgress = true;
        try {
          await forgettingService.forget({
            scopeType: resolvedConfig.forgettingScopeType ?? 'global',
            scopeId: resolvedConfig.forgettingScopeId,
            strategy: 'combined',
            limit: resolvedConfig.maxForgetEntriesPerEvent,
            dryRun: false,
            agentId: 'memory-pressure-response-manual',
          });
          stats.forgettingsTriggered++;
        } finally {
          isForgetInProgress = false;
        }
      }
    },
  };
}

export type MemoryPressureResponseService = ReturnType<typeof createMemoryPressureResponseService>;
