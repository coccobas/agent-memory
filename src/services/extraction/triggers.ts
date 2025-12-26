/**
 * Extraction Triggers - Types and Interfaces
 *
 * Defines the trigger system for auto-detecting moments worth storing in memory.
 * This module provides the foundational types for the extraction trigger system.
 *
 * Trigger Types:
 * - USER_CORRECTION: User reverses or corrects agent actions
 * - ERROR_RECOVERY: Error followed by successful workaround
 * - ENTHUSIASM: Positive reactions/enthusiasm signals
 * - REPEATED_REQUEST: Same request pattern across sessions
 * - SURPRISE_MOMENT: Unexpected outcomes worth remembering
 *
 * @module extraction/triggers
 */

// =============================================================================
// TRIGGER TYPES ENUM
// =============================================================================

/**
 * Types of triggers that can initiate memory extraction.
 * Each trigger type represents a specific pattern worth capturing.
 */
export enum TriggerType {
  /** User explicitly corrects or reverses an agent action */
  USER_CORRECTION = 'USER_CORRECTION',

  /** An error occurred followed by a successful workaround */
  ERROR_RECOVERY = 'ERROR_RECOVERY',

  /** User expresses enthusiasm or strong positive reaction */
  ENTHUSIASM = 'ENTHUSIASM',

  /** Same or similar request pattern detected across multiple sessions */
  REPEATED_REQUEST = 'REPEATED_REQUEST',

  /** An unexpected outcome that warrants memory storage */
  SURPRISE_MOMENT = 'SURPRISE_MOMENT',
}

// =============================================================================
// MESSAGE TYPES
// =============================================================================

/**
 * Role of a message in a conversation.
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Represents a single message in a conversation.
 */
export interface Message {
  /** Unique identifier for this message */
  id: string;

  /** Role of the message sender */
  role: MessageRole;

  /** Content of the message */
  content: string;

  /** Timestamp of when the message was sent */
  timestamp: string;

  /** Optional metadata about the message */
  metadata?: {
    /** Whether this message contains an error */
    hasError?: boolean;

    /** Error message if applicable */
    errorMessage?: string;

    /** Tool name if this is a tool message */
    toolName?: string;

    /** Whether a tool call succeeded */
    toolSuccess?: boolean;

    /** Session ID this message belongs to */
    sessionId?: string;
  };
}

// =============================================================================
// TRIGGER EVENT TYPES
// =============================================================================

/**
 * Confidence level of a trigger detection.
 */
export type TriggerConfidence = 'low' | 'medium' | 'high';

/**
 * Represents a detected trigger event.
 */
export interface TriggerEvent {
  /** Type of trigger that was detected */
  type: TriggerType;

  /** Confidence level of the detection */
  confidence: TriggerConfidence;

  /** Numeric confidence score (0-1) */
  score: number;

  /** Human-readable reason for the trigger */
  reason: string;

  /** Timestamp of when the trigger was detected */
  detectedAt: string;

  /** Context that triggered this event */
  context: TriggerContext;

  /** Suggested memory entry type */
  suggestedEntryType?: 'guideline' | 'knowledge' | 'tool';

  /** Suggested priority for the memory entry (0-100) */
  suggestedPriority?: number;

  /** Extracted content to be stored */
  extractedContent?: ExtractedTriggerContent;
}

/**
 * Context information for a trigger event.
 */
export interface TriggerContext {
  /** Message(s) that triggered the event */
  triggeringMessages: Message[];

  /** Previous messages providing context */
  previousMessages?: Message[];

  /** Session ID where the trigger occurred */
  sessionId?: string;

  /** Project ID if available */
  projectId?: string;

  /** Turn number in the conversation */
  turnNumber?: number;
}

/**
 * Content extracted from a trigger event.
 */
export interface ExtractedTriggerContent {
  /** What was wrong (for corrections) */
  whatWasWrong?: string;

  /** What was right/correct */
  whatWasRight?: string;

  /** The error that occurred (for error recovery) */
  errorDescription?: string;

  /** The successful workaround (for error recovery) */
  successfulApproach?: string;

  /** The positive aspect (for enthusiasm) */
  positiveAspect?: string;

  /** The repeated pattern (for repetition) */
  repeatedPattern?: string;

  /** Number of times the pattern was repeated */
  repetitionCount?: number;

  /** The unexpected outcome (for surprise) */
  unexpectedOutcome?: string;

  /** Raw extracted text */
  rawContent?: string;
}

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

/**
 * Configuration for the trigger detection system.
 */
export interface TriggerConfig {
  /** Whether trigger detection is enabled */
  enabled: boolean;

  /** Phrases that indicate user corrections */
  correctionPhrases: string[];

  /** Phrases that indicate enthusiasm */
  enthusiasmPhrases: string[];

  /** Minimum number of similar requests to trigger repetition detection */
  repetitionThreshold: number;

  /** Cooldown period between extractions (ms) to prevent over-extraction */
  cooldownMs: number;

  /** Similarity threshold for detecting repeated requests (0-1) */
  repetitionSimilarityThreshold: number;

  /** Minimum confidence score to trigger extraction (0-1) */
  minConfidenceScore: number;

  /** Maximum messages to look back for context */
  contextWindowSize: number;

  /** Weight multiplier for position-based enthusiasm scoring */
  enthusiasmPositionWeight: number;

  /** Phrases that indicate negation (to filter false positives) */
  negationPhrases: string[];

  /** Phrases that indicate questions (to filter false positives) */
  questionIndicators: string[];
}

/**
 * Default configuration for trigger detection.
 */
export const DEFAULT_TRIGGER_CONFIG: TriggerConfig = {
  enabled: true,
  correctionPhrases: [
    'no',
    'actually',
    'i meant',
    'not that',
    'undo',
    'wrong',
    'incorrect',
    'that\'s not',
    'thats not',
    'nope',
    'instead',
    'should be',
    'should have been',
    'i said',
    'i wanted',
    'not what i',
    'revert',
    'go back',
    'cancel',
  ],
  enthusiasmPhrases: [
    'perfect',
    'exactly',
    'love it',
    'great',
    'thanks',
    'awesome',
    'excellent',
    'amazing',
    'wonderful',
    'fantastic',
    'brilliant',
    'nice',
    'good job',
    'well done',
    'that\'s it',
    'thats it',
    'yes!',
    'works',
    'working',
  ],
  negationPhrases: [
    'not perfect',
    'not exactly',
    'not great',
    'don\'t love',
    'isn\'t perfect',
    'but',
    'however',
    'although',
  ],
  questionIndicators: [
    '?',
    'is it',
    'would it',
    'could you',
    'can you',
    'how do',
    'what if',
    'why',
  ],
  repetitionThreshold: 3,
  cooldownMs: 30000,
  repetitionSimilarityThreshold: 0.8,
  minConfidenceScore: 0.6,
  contextWindowSize: 10,
  enthusiasmPositionWeight: 1.5,
};

// =============================================================================
// SESSION CONTEXT TYPES
// =============================================================================

/**
 * Session context for trigger detection.
 */
export interface SessionContext {
  /** Current session ID */
  sessionId: string;

  /** Project ID if available */
  projectId?: string;

  /** Organization ID if available */
  orgId?: string;

  /** Agent ID if available */
  agentId?: string;

  /** Messages in the current session */
  messages: Message[];

  /** Historical messages from previous sessions (for repetition detection) */
  historicalMessages?: Message[];

  /** Timestamp of last extraction */
  lastExtractionTime?: string;

  /** Number of extractions in current session */
  extractionCount: number;

  /** Recent errors in the session */
  recentErrors: ErrorRecord[];

  /** Metadata about the session */
  metadata?: Record<string, unknown>;
}

/**
 * Record of an error that occurred in a session.
 */
export interface ErrorRecord {
  /** Timestamp of the error */
  timestamp: string;

  /** Error message */
  message: string;

  /** Whether recovery was attempted */
  recoveryAttempted: boolean;

  /** Whether recovery was successful */
  recoverySuccessful?: boolean;

  /** Message ID where the error occurred */
  messageId?: string;
}

// =============================================================================
// DETECTOR INTERFACE
// =============================================================================

/**
 * Interface for trigger detectors.
 */
export interface ITriggerDetector {
  /**
   * Detect correction triggers in messages.
   * @param messages - Messages to analyze
   * @param config - Trigger configuration
   * @returns Trigger event if detected, null otherwise
   */
  detectCorrection(messages: Message[], config: TriggerConfig): TriggerEvent | null;

  /**
   * Detect error recovery triggers.
   * @param messages - Messages to analyze
   * @param context - Session context with error history
   * @param config - Trigger configuration
   * @returns Trigger event if detected, null otherwise
   */
  detectErrorRecovery(
    messages: Message[],
    context: SessionContext,
    config: TriggerConfig
  ): TriggerEvent | null;

  /**
   * Detect enthusiasm triggers in a message.
   * @param message - Message to analyze
   * @param config - Trigger configuration
   * @returns Trigger event if detected, null otherwise
   */
  detectEnthusiasm(message: Message, config: TriggerConfig): TriggerEvent | null;

  /**
   * Detect repetition triggers across sessions.
   * @param currentMessages - Current session messages
   * @param historicalMessages - Historical messages from previous sessions
   * @param config - Trigger configuration
   * @returns Trigger event if detected, null otherwise
   */
  detectRepetition(
    currentMessages: Message[],
    historicalMessages: Message[],
    config: TriggerConfig
  ): TriggerEvent | null;

  /**
   * Detect all applicable triggers for a message.
   * @param message - Message to analyze
   * @param context - Session context
   * @param config - Trigger configuration
   * @returns Array of detected trigger events
   */
  detectAll(
    message: Message,
    context: SessionContext,
    config: TriggerConfig
  ): TriggerEvent[];
}

// =============================================================================
// OBSERVER INTERFACE
// =============================================================================

/**
 * Interface for the memory observation service.
 * This is called when triggers fire to store observations.
 */
export interface IMemoryObserver {
  /**
   * Store an observation based on a trigger event.
   * @param event - The trigger event that fired
   * @param context - Session context
   * @returns Promise that resolves when observation is stored
   */
  observe(event: TriggerEvent, context: SessionContext): Promise<void>;
}

// =============================================================================
// ORCHESTRATOR INTERFACE
// =============================================================================

/**
 * Interface for the trigger orchestrator.
 */
export interface ITriggerOrchestrator {
  /**
   * Process a new message and trigger extraction if applicable.
   * @param message - New message to process
   * @param context - Session context
   * @returns Promise with detected trigger events
   */
  processMessage(message: Message, context: SessionContext): Promise<TriggerEvent[]>;

  /**
   * Get the current configuration.
   * @returns Current trigger configuration
   */
  getConfig(): TriggerConfig;

  /**
   * Update the configuration.
   * @param config - Partial configuration to merge
   */
  updateConfig(config: Partial<TriggerConfig>): void;

  /**
   * Check if extraction is allowed (not in cooldown).
   * @param context - Session context
   * @returns Whether extraction is allowed
   */
  isExtractionAllowed(context: SessionContext): boolean;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Result of phrase matching.
 */
export interface PhraseMatchResult {
  /** Whether a match was found */
  matched: boolean;

  /** The phrase that matched */
  matchedPhrase?: string;

  /** Position of the match in the text */
  position?: number;

  /** Whether the match is at the end of the text */
  isAtEnd?: boolean;
}

/**
 * Statistics about trigger detection.
 */
export interface TriggerStats {
  /** Total triggers detected */
  totalDetected: number;

  /** Triggers by type */
  byType: Record<TriggerType, number>;

  /** Average confidence score */
  avgConfidence: number;

  /** Triggers that resulted in extraction */
  extractedCount: number;

  /** Triggers filtered by cooldown */
  cooldownFiltered: number;
}
