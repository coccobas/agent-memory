/**
 * Missed Extraction Module
 *
 * Analyzes conversation transcripts at session-end to find facts, bugs,
 * decisions, and guidelines that weren't captured during the session.
 */

export { MissedExtractionDetector } from './detector.js';
export type {
  ConversationMessage,
  MissedExtractionConfig,
  MissedExtractionRequest,
  MissedExtractionResult,
  MissedEntry,
  MissedExtractionDetectorDeps,
} from './types.js';
export { DEFAULT_MISSED_EXTRACTION_CONFIG } from './types.js';
