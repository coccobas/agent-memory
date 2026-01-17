/**
 * Trigger Orchestrator - Coordinates Trigger Detection and Memory Observation
 *
 * The orchestrator is responsible for:
 * - Processing incoming messages through the trigger detection pipeline
 * - Managing cooldown periods to prevent over-extraction
 * - Invoking memory observation when triggers fire
 * - Tracking extraction statistics
 *
 * @module extraction/trigger-orchestrator
 */

import { createComponentLogger } from '../../utils/logger.js';
import type {
  Message,
  TriggerEvent,
  TriggerConfig,
  SessionContext,
  ITriggerOrchestrator,
  IMemoryObserver,
  TriggerStats,
} from './triggers.js';
import { TriggerType, DEFAULT_TRIGGER_CONFIG } from './triggers.js';
import type { TriggerDetector } from './trigger-detector.js';
import { createTriggerDetector } from './trigger-detector.js';
import type { ObserveCommitService } from '../observe/index.js';
import type { IncrementalMemoryObserver } from './incremental-observer.js';

const logger = createComponentLogger('trigger-orchestrator');

// =============================================================================
// ORCHESTRATOR IMPLEMENTATION
// =============================================================================

/**
 * Orchestrates trigger detection and memory observation.
 *
 * This class coordinates the flow:
 * 1. Receive message
 * 2. Check if extraction is allowed (cooldown)
 * 3. Run trigger detection
 * 4. Filter triggers by confidence
 * 5. Invoke memory observer for qualifying triggers
 * 6. Track statistics
 */
export class TriggerOrchestrator implements ITriggerOrchestrator {
  private config: TriggerConfig;
  private detector: TriggerDetector;
  private observer: IMemoryObserver | null;
  private stats: TriggerStats;
  private lastExtractionTimes: Map<string, number>;

  /**
   * Create a new TriggerOrchestrator instance.
   *
   * @param config - Optional configuration override
   * @param observer - Optional memory observer for auto-extraction
   * @param detector - Optional custom detector (for testing)
   */
  constructor(
    config?: Partial<TriggerConfig>,
    observer?: IMemoryObserver,
    detector?: TriggerDetector
  ) {
    this.config = { ...DEFAULT_TRIGGER_CONFIG, ...config };
    this.detector = detector || createTriggerDetector(this.config);
    this.observer = observer || null;
    this.lastExtractionTimes = new Map();
    this.stats = this.initializeStats();
  }

  /**
   * Process a new message and trigger extraction if applicable.
   *
   * This is the main entry point for the trigger system. It:
   * 1. Validates the message and context
   * 2. Checks cooldown state
   * 3. Runs all trigger detectors
   * 4. Filters by confidence threshold
   * 5. Invokes memory observation for valid triggers
   *
   * @param message - New message to process
   * @param context - Session context
   * @returns Promise with detected trigger events
   */
  async processMessage(message: Message, context: SessionContext): Promise<TriggerEvent[]> {
    if (!this.config.enabled) {
      logger.debug('Trigger detection is disabled');
      return [];
    }

    // Validate input
    if (!message || !message.content) {
      logger.warn('Invalid message received');
      return [];
    }

    if (!context || !context.sessionId) {
      logger.warn('Invalid session context received');
      return [];
    }

    // Check cooldown
    if (!this.isExtractionAllowed(context)) {
      logger.debug({ sessionId: context.sessionId }, 'Extraction blocked by cooldown');
      this.stats.cooldownFiltered++;
      return [];
    }

    // Run all detectors
    const triggers = this.detector.detectAll(message, context, this.config);

    if (triggers.length === 0) {
      return [];
    }

    // Update statistics
    for (const trigger of triggers) {
      this.updateStats(trigger);
    }

    // Filter by confidence threshold
    const qualifyingTriggers = triggers.filter((t) => t.score >= this.config.minConfidenceScore);

    if (qualifyingTriggers.length === 0) {
      logger.debug(
        { totalTriggers: triggers.length },
        'All triggers filtered by confidence threshold'
      );
      return triggers; // Return all detected but don't extract
    }

    // Sort by score (highest first)
    qualifyingTriggers.sort((a, b) => b.score - a.score);

    // Log detection
    const topTrigger = qualifyingTriggers[0];
    logger.info(
      {
        sessionId: context.sessionId,
        triggerCount: qualifyingTriggers.length,
        types: qualifyingTriggers.map((t) => t.type),
        topScore: topTrigger?.score ?? 0,
      },
      'Triggers detected'
    );

    // Invoke memory observer for each qualifying trigger
    if (this.observer) {
      // Update last extraction time BEFORE processing to prevent race conditions
      // This ensures concurrent messages won't all pass the cooldown check
      this.lastExtractionTimes.set(context.sessionId, Date.now());

      for (const trigger of qualifyingTriggers) {
        try {
          await this.observer.observe(trigger, context);
          this.stats.extractedCount++;

          logger.debug(
            {
              type: trigger.type,
              confidence: trigger.confidence,
              sessionId: context.sessionId,
            },
            'Trigger observation completed'
          );
        } catch (error) {
          logger.error(
            {
              type: trigger.type,
              error: error instanceof Error ? error.message : String(error),
              sessionId: context.sessionId,
            },
            'Failed to observe trigger'
          );
          // Continue with other triggers even if one fails
        }
      }
    }

    return qualifyingTriggers;
  }

  /**
   * Get the current configuration.
   * @returns Current trigger configuration
   */
  getConfig(): TriggerConfig {
    return { ...this.config };
  }

  /**
   * Update the configuration.
   *
   * Merges the provided partial config with the existing config.
   * Also updates the detector's config.
   *
   * @param config - Partial configuration to merge
   */
  updateConfig(config: Partial<TriggerConfig>): void {
    this.config = { ...this.config, ...config };

    // Create a new detector with updated config
    this.detector = createTriggerDetector(this.config);

    logger.debug({ updatedFields: Object.keys(config) }, 'Configuration updated');
  }

  /**
   * Check if extraction is allowed (not in cooldown).
   *
   * Extraction is allowed if:
   * - Cooldown is disabled (cooldownMs = 0)
   * - No previous extraction in this session
   * - Cooldown period has elapsed since last extraction
   *
   * @param context - Session context
   * @returns Whether extraction is allowed
   */
  isExtractionAllowed(context: SessionContext): boolean {
    if (this.config.cooldownMs <= 0) {
      return true;
    }

    const lastExtraction = this.lastExtractionTimes.get(context.sessionId);

    if (!lastExtraction) {
      // Check context for last extraction time
      if (context.lastExtractionTime) {
        const lastTime = new Date(context.lastExtractionTime).getTime();
        const elapsed = Date.now() - lastTime;
        return elapsed >= this.config.cooldownMs;
      }
      return true;
    }

    const elapsed = Date.now() - lastExtraction;
    return elapsed >= this.config.cooldownMs;
  }

  /**
   * Set the memory observer.
   *
   * Allows setting the observer after construction for dependency injection.
   *
   * @param observer - Memory observer to use
   */
  setObserver(observer: IMemoryObserver): void {
    this.observer = observer;
  }

  /**
   * Wire commit service to the observer if it supports it.
   * This allows deferred injection of the commit service.
   */
  setObserverCommitService(commitService: ObserveCommitService): void {
    if (this.observer && 'setCommitService' in this.observer) {
      (this.observer as IncrementalMemoryObserver).setCommitService(commitService);
    }
  }

  /**
   * Get current statistics.
   * @returns Trigger detection statistics
   */
  getStats(): TriggerStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats = this.initializeStats();
    this.lastExtractionTimes.clear();
  }

  /**
   * Get the trigger detector (for testing).
   * @returns The underlying trigger detector
   */
  getDetector(): TriggerDetector {
    return this.detector;
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  /**
   * Initialize statistics object.
   */
  private initializeStats(): TriggerStats {
    return {
      totalDetected: 0,
      byType: {
        [TriggerType.USER_CORRECTION]: 0,
        [TriggerType.ERROR_RECOVERY]: 0,
        [TriggerType.ENTHUSIASM]: 0,
        [TriggerType.REPEATED_REQUEST]: 0,
        [TriggerType.SURPRISE_MOMENT]: 0,
      },
      avgConfidence: 0,
      extractedCount: 0,
      cooldownFiltered: 0,
    };
  }

  /**
   * Update statistics with a new trigger.
   * @param trigger - Trigger event to track
   */
  private updateStats(trigger: TriggerEvent): void {
    this.stats.totalDetected++;
    this.stats.byType[trigger.type]++;

    // Update running average confidence
    const prevTotal = this.stats.totalDetected - 1;
    const prevAvg = this.stats.avgConfidence;
    this.stats.avgConfidence = (prevAvg * prevTotal + trigger.score) / this.stats.totalDetected;
  }
}

// =============================================================================
// DEFAULT MEMORY OBSERVER
// =============================================================================

/**
 * No-op memory observer for when no real observer is configured.
 * Logs triggers but does not persist them.
 */
export class NoOpMemoryObserver implements IMemoryObserver {
  private logger = createComponentLogger('noop-observer');

  async observe(event: TriggerEvent, context: SessionContext): Promise<void> {
    this.logger.debug(
      {
        type: event.type,
        confidence: event.confidence,
        sessionId: context.sessionId,
        reason: event.reason,
      },
      'Trigger observed (no-op)'
    );
  }
}

// =============================================================================
// LOGGING MEMORY OBSERVER
// =============================================================================

/**
 * Memory observer that logs all triggers with full details.
 * Useful for debugging and development.
 */
export class LoggingMemoryObserver implements IMemoryObserver {
  private logger = createComponentLogger('logging-observer');

  async observe(event: TriggerEvent, context: SessionContext): Promise<void> {
    this.logger.info(
      {
        type: event.type,
        confidence: event.confidence,
        score: event.score,
        reason: event.reason,
        suggestedEntryType: event.suggestedEntryType,
        suggestedPriority: event.suggestedPriority,
        sessionId: context.sessionId,
        projectId: context.projectId,
        extractedContent: event.extractedContent,
        triggeringMessageCount: event.context.triggeringMessages.length,
      },
      'Trigger detected and logged'
    );
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a new TriggerOrchestrator instance.
 *
 * @param config - Optional configuration override
 * @param observer - Optional memory observer
 * @returns TriggerOrchestrator instance
 */
export function createTriggerOrchestrator(
  config?: Partial<TriggerConfig>,
  observer?: IMemoryObserver
): TriggerOrchestrator {
  return new TriggerOrchestrator(config, observer);
}

/**
 * Create a TriggerOrchestrator with logging observer.
 *
 * Useful for development and debugging.
 *
 * @param config - Optional configuration override
 * @returns TriggerOrchestrator with logging observer
 */
export function createLoggingOrchestrator(config?: Partial<TriggerConfig>): TriggerOrchestrator {
  return new TriggerOrchestrator(config, new LoggingMemoryObserver());
}

// =============================================================================
// INTEGRATION HELPER
// =============================================================================

/**
 * Helper class for integrating trigger orchestration with the memory system.
 *
 * This provides a convenient interface for:
 * - Creating and managing the orchestrator
 * - Processing message streams
 * - Accessing statistics
 */
export class TriggerIntegration {
  private orchestrator: TriggerOrchestrator;
  private enabled: boolean;

  constructor(config?: Partial<TriggerConfig>, observer?: IMemoryObserver) {
    this.orchestrator = createTriggerOrchestrator(config, observer);
    this.enabled = config?.enabled ?? DEFAULT_TRIGGER_CONFIG.enabled;
  }

  /**
   * Process a message and return any detected triggers.
   */
  async processMessage(message: Message, context: SessionContext): Promise<TriggerEvent[]> {
    if (!this.enabled) {
      return [];
    }
    return this.orchestrator.processMessage(message, context);
  }

  /**
   * Enable trigger detection.
   */
  enable(): void {
    this.enabled = true;
    this.orchestrator.updateConfig({ enabled: true });
  }

  /**
   * Disable trigger detection.
   */
  disable(): void {
    this.enabled = false;
    this.orchestrator.updateConfig({ enabled: false });
  }

  /**
   * Check if trigger detection is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get statistics.
   */
  getStats(): TriggerStats {
    return this.orchestrator.getStats();
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.orchestrator.resetStats();
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<TriggerConfig>): void {
    this.orchestrator.updateConfig(config);
    if (config.enabled !== undefined) {
      this.enabled = config.enabled;
    }
  }

  /**
   * Get the underlying orchestrator.
   */
  getOrchestrator(): TriggerOrchestrator {
    return this.orchestrator;
  }
}

/**
 * Create a TriggerIntegration instance.
 *
 * @param config - Optional configuration override
 * @param observer - Optional memory observer
 * @returns TriggerIntegration instance
 */
export function createTriggerIntegration(
  config?: Partial<TriggerConfig>,
  observer?: IMemoryObserver
): TriggerIntegration {
  return new TriggerIntegration(config, observer);
}
