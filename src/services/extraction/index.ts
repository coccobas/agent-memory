/**
 * Extraction Triggers Module
 *
 * Auto-detects moments worth storing in memory:
 * - User corrections that reverse agent actions
 * - Errors followed by successful workarounds
 * - Positive reactions/enthusiasm signals
 * - Repeated request patterns across sessions
 * - Surprise moments (unexpected outcomes)
 *
 * @module extraction
 *
 * @example
 * ```typescript
 * import {
 *   createTriggerOrchestrator,
 *   TriggerType,
 *   DEFAULT_TRIGGER_CONFIG,
 * } from './services/extraction';
 *
 * // Create orchestrator with custom config
 * const orchestrator = createTriggerOrchestrator({
 *   ...DEFAULT_TRIGGER_CONFIG,
 *   cooldownMs: 60000, // 1 minute cooldown
 * });
 *
 * // Process a message
 * const triggers = await orchestrator.processMessage(message, sessionContext);
 *
 * for (const trigger of triggers) {
 *   console.log(`Detected ${trigger.type} with confidence ${trigger.confidence}`);
 * }
 * ```
 */

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

export {
  // Enums
  TriggerType,

  // Message types
  type MessageRole,
  type Message,

  // Trigger event types
  type TriggerConfidence,
  type TriggerEvent,
  type TriggerContext,
  type ExtractedTriggerContent,

  // Configuration types
  type TriggerConfig,
  DEFAULT_TRIGGER_CONFIG,

  // Session context types
  type SessionContext,
  type ErrorRecord,

  // Interface types
  type ITriggerDetector,
  type IMemoryObserver,
  type ITriggerOrchestrator,

  // Utility types
  type PhraseMatchResult,
  type TriggerStats,
} from './triggers.js';

// =============================================================================
// DETECTOR
// =============================================================================

export { TriggerDetector, createTriggerDetector } from './trigger-detector.js';

// =============================================================================
// ORCHESTRATOR
// =============================================================================

export {
  TriggerOrchestrator,
  NoOpMemoryObserver,
  LoggingMemoryObserver,
  createTriggerOrchestrator,
  createLoggingOrchestrator,
  TriggerIntegration,
  createTriggerIntegration,
} from './trigger-orchestrator.js';

// =============================================================================
// INCREMENTAL EXTRACTION
// =============================================================================

export {
  IncrementalExtractor,
  createIncrementalExtractor,
  type IncrementalExtractorConfig,
  type IncrementalExtractionResult,
  DEFAULT_INCREMENTAL_CONFIG,
} from './incremental.js';

export {
  IncrementalMemoryObserver,
  createIncrementalMemoryObserver,
} from './incremental-observer.js';

// =============================================================================
// ATOMICITY - Ensure entries contain one concept each
// =============================================================================

export {
  detectCompoundEntry,
  splitCompoundEntry,
  ensureAtomicity,
  createAtomicityConfig,
  type AtomicityConfig,
  type DetectionResult,
  type AtomicityResult,
} from './atomicity.js';

// =============================================================================
// CONFIDENCE BOOSTING
// =============================================================================

export {
  ConfidenceBooster,
  createConfidenceBooster,
  getDefaultConfidenceBooster,
  boostExtractionConfidence,
  DEFAULT_BOOST_PATTERNS,
  type BoostPattern,
  type BoostResult,
  type ExtractedEntry,
} from './confidence-booster.js';
