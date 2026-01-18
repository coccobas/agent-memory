/**
 * Capture Service Types
 *
 * Types for the unified capture service that handles:
 * - Session-end experience extraction
 * - Turn-based knowledge capture
 * - Explicit case recording
 */

import type { Experience, Knowledge, Guideline, Tool } from '../../db/schema.js';

// =============================================================================
// TURN & TRANSCRIPT TYPES
// =============================================================================

/**
 * Data for a single conversation turn
 */
export interface TurnData {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  toolCalls?: ToolCallData[];
  tokenCount?: number;
}

/**
 * Tool call information within a turn
 */
export interface ToolCallData {
  name: string;
  input: Record<string, unknown>;
  output?: unknown;
  success?: boolean;
  durationMs?: number;
}

/**
 * Metrics tracked during a conversation
 */
export interface TurnMetrics {
  turnCount: number;
  userTurnCount: number;
  assistantTurnCount: number;
  totalTokens: number;
  toolCallCount: number;
  uniqueToolsUsed: Set<string>;
  errorCount: number;
  startTime: number;
  lastTurnTime: number;
}

/**
 * A chunk of transcript for processing
 */
export interface TranscriptChunk {
  turns: TurnData[];
  startIndex: number;
  endIndex: number;
  tokenCount: number;
}

// =============================================================================
// CAPTURE RESULT TYPES
// =============================================================================

/**
 * Result from capturing experiences
 */
export interface ExperienceCaptureResult {
  experiences: Array<{
    experience: Experience;
    confidence: number;
    source: 'observation' | 'reflection';
  }>;
  skippedDuplicates: number;
  processingTimeMs: number;
}

/**
 * Result from capturing knowledge/guidelines
 */
export interface KnowledgeCaptureResult {
  knowledge: Array<{
    entry: Knowledge;
    confidence: number;
  }>;
  guidelines: Array<{
    entry: Guideline;
    confidence: number;
  }>;
  tools: Array<{
    entry: Tool;
    confidence: number;
  }>;
  skippedDuplicates: number;
  processingTimeMs: number;
}

/**
 * Combined capture result
 */
export interface CaptureResult {
  experiences: ExperienceCaptureResult;
  knowledge: KnowledgeCaptureResult;
  totalProcessingTimeMs: number;
}

// =============================================================================
// CAPTURE MODULE INTERFACE
// =============================================================================

/**
 * Interface for capture modules (experience, knowledge)
 */
export interface CaptureModule<TResult> {
  /**
   * Process transcript and extract entries
   */
  capture(transcript: TurnData[], metrics: TurnMetrics, options: CaptureOptions): Promise<TResult>;

  /**
   * Check if capture should be triggered based on thresholds
   */
  shouldCapture(metrics: TurnMetrics, config: CaptureConfig): boolean;
}

// =============================================================================
// RECORD CASE TYPES
// =============================================================================

/**
 * Parameters for explicit case recording
 */
export interface RecordCaseParams {
  projectId?: string;
  sessionId?: string;
  agentId?: string;

  // Case content
  title: string;
  scenario: string;
  outcome: string;
  content?: string;

  // Trajectory (optional)
  trajectory?: TrajectoryStep[];

  // Metadata
  category?: string;
  confidence?: number;
  source?: 'user' | 'observation';

  // Episode linking (optional)
  /** If provided, the captured experience will be linked to this episode */
  episodeId?: string;
}

/**
 * A step in an experience trajectory
 */
export interface TrajectoryStep {
  action: string;
  observation?: string;
  reasoning?: string;
  toolUsed?: string;
  success?: boolean;
  timestamp?: string;
  durationMs?: number;
}

// =============================================================================
// CAPTURE OPTIONS & CONFIG
// =============================================================================

/**
 * Options for a capture operation
 */
export interface CaptureOptions {
  projectId?: string;
  sessionId?: string;
  agentId?: string;
  scopeType: 'global' | 'org' | 'project' | 'session';
  scopeId?: string;

  // Extraction options
  autoStore?: boolean;
  confidenceThreshold?: number;
  skipDuplicates?: boolean;

  // Focus areas
  focusAreas?: ('decisions' | 'facts' | 'rules' | 'tools' | 'experiences')[];

  // Episode linking (optional)
  /** If provided, all captured experiences will be linked to this episode */
  episodeId?: string;
}

/**
 * Configuration for experience capture triggers and thresholds
 */
export interface ExperienceCaptureConfig {
  enabled: boolean;
  triggers: {
    sessionEnd: boolean; // Trigger on session end (via librarian)
    episodeComplete: boolean; // Trigger on episode complete/fail
    turnBased: boolean; // Trigger on turn with experience patterns
    promptComplex: boolean; // Prompt user after complex tasks
  };
  thresholds: {
    turnConfidence: number; // Min confidence for turn triggers (default: 0.8)
    turnCooldownMs: number; // Cooldown between turn captures (default: 60000)
    maxPerSession: number; // Max experiences per session (default: 10)
    complexityToolCalls: number; // Tool calls threshold for complexity (default: 10)
    complexityDurationMs: number; // Duration threshold for complexity (default: 300000)
  };
}

/**
 * Configuration for capture thresholds and behavior
 */
export interface CaptureConfig {
  enabled: boolean;

  // Session-end capture settings
  sessionEnd: {
    enabled: boolean;
    minTurns: number;
    minTokens: number;
    extractExperiences: boolean;
    extractKnowledge: boolean;
  };

  // Turn-based capture settings
  turnBased: {
    enabled: boolean;
    triggerAfterTurns: number;
    triggerAfterTokens: number;
    triggerOnToolError: boolean;
    maxCapturesPerSession: number;
  };

  // Deduplication settings
  deduplication: {
    enabled: boolean;
    similarityThreshold: number;
    hashAlgorithm: 'sha256' | 'md5';
  };

  // Confidence thresholds
  confidence: {
    experience: number;
    knowledge: number;
    guideline: number;
    tool: number;
  };

  // Experience capture settings (optional, for automatic experience capture)
  experienceCapture?: ExperienceCaptureConfig;
}

// =============================================================================
// SHARED STATE TYPES
// =============================================================================

/**
 * State tracked across a capture session
 */
export interface CaptureSessionState {
  sessionId: string;
  projectId?: string;
  startTime: number;

  // Accumulated data
  transcript: TurnData[];
  metrics: TurnMetrics;

  // Deduplication
  contentHashes: Set<string>;
  capturedIds: Set<string>;

  // Capture tracking
  captureCount: number;
  lastCaptureTime?: number;

  // Incremental extraction tracking
  lastExtractionTurnIndex: number;
  extractedContentHashes: Set<string>;
  extractionSummaries: string[];
}

/**
 * A window of turns for incremental extraction
 */
export interface ExtractionWindow {
  sessionId: string;
  turns: TurnData[];
  startIndex: number;
  endIndex: number;
  tokenCount: number;
  newTurnCount: number;
}

/**
 * Hash entry for deduplication
 */
export interface ContentHash {
  hash: string;
  entryType: 'experience' | 'knowledge' | 'guideline' | 'tool';
  entryId: string;
  createdAt: number;
}

/**
 * Learn prompt suggestion returned when a complex task is detected.
 * Used by Trigger 4: Complex Task Prompts.
 */
export interface LearnPrompt {
  /** Suggested learn text based on context */
  suggestion: string;
  /** Confidence in the suggestion (0-1) */
  confidence: number;
  /** Ready-to-use action for the user */
  action: string;
  /** Complexity signals that triggered this prompt */
  signals: string[];
}
