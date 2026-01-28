/**
 * Intent Detection Service
 *
 * Orchestrates intent detection for the unified memory tool.
 * Uses pattern matching for fast, deterministic intent recognition.
 */

import { createComponentLogger } from '../../utils/logger.js';
import {
  detectIntent,
  detectEntryType,
  detectCategory,
  extractTitleFromContent,
  type Intent,
  type IntentMatch,
} from './patterns.js';

const logger = createComponentLogger('intent-detection');

// =============================================================================
// TYPES
// =============================================================================

export { Intent, IntentMatch };

export interface IntentDetectionResult {
  intent: Intent;
  confidence: number;
  entryType?: 'guideline' | 'knowledge' | 'tool';
  category?: string;
  title?: string;
  content?: string;
  query?: string;
  sessionName?: string;
  target?: string;
  tagFilter?: string;
  name?: string;
  message?: string;
  eventType?: string;
  outcome?: string;
  outcomeType?: string;
  ref?: string;
  text?: string;
  rawPatterns: string[];
}

export interface IIntentDetectionService {
  /**
   * Detect intent from natural language input
   */
  detect(text: string): IntentDetectionResult;

  /**
   * Check if confidence meets threshold for auto-execution
   */
  isHighConfidence(result: IntentDetectionResult): boolean;
}

// =============================================================================
// IMPLEMENTATION
// =============================================================================

export class IntentDetectionService implements IIntentDetectionService {
  private readonly confidenceThreshold: number;

  constructor(options?: { confidenceThreshold?: number }) {
    this.confidenceThreshold = options?.confidenceThreshold ?? 0.7;
  }

  detect(text: string): IntentDetectionResult {
    const match = detectIntent(text);

    logger.debug(
      { text: text.substring(0, 100), intent: match.intent, confidence: match.confidence },
      'Intent detected'
    );

    // Build enriched result
    const result: IntentDetectionResult = {
      intent: match.intent,
      confidence: match.confidence,
      rawPatterns: match.patterns,
    };

    // Add extracted params based on intent
    if (match.extractedParams.content) {
      result.content = match.extractedParams.content;
      result.title = extractTitleFromContent(match.extractedParams.content);
    }

    if (match.extractedParams.entryType) {
      result.entryType = match.extractedParams.entryType as 'guideline' | 'knowledge' | 'tool';
    } else {
      // Try to detect entry type from full text
      result.entryType = detectEntryType(text);
    }

    if (match.extractedParams.category) {
      result.category = match.extractedParams.category;
    } else {
      // Try to detect category from full text
      result.category = detectCategory(text);
    }

    if (match.extractedParams.query) {
      result.query = match.extractedParams.query;
    }

    if (match.extractedParams.sessionName) {
      result.sessionName = match.extractedParams.sessionName;
    }

    if (match.extractedParams.target) {
      result.target = match.extractedParams.target;
    }

    // Episode-related params
    if (match.extractedParams.name) {
      result.name = match.extractedParams.name;
    }
    if (match.extractedParams.message) {
      result.message = match.extractedParams.message;
    }
    if (match.extractedParams.eventType) {
      result.eventType = match.extractedParams.eventType;
    }
    if (match.extractedParams.outcome) {
      result.outcome = match.extractedParams.outcome;
    }
    if (match.extractedParams.outcomeType) {
      result.outcomeType = match.extractedParams.outcomeType;
    }
    if (match.extractedParams.ref) {
      result.ref = match.extractedParams.ref;
    }
    if (match.extractedParams.text) {
      result.text = match.extractedParams.text;
    }
    if (match.extractedParams.tagFilter) {
      result.tagFilter = match.extractedParams.tagFilter;
    }

    return result;
  }

  isHighConfidence(result: IntentDetectionResult): boolean {
    return result.confidence >= this.confidenceThreshold;
  }
}

/**
 * Create an intent detection service instance
 */
export function createIntentDetectionService(options?: {
  confidenceThreshold?: number;
}): IIntentDetectionService {
  return new IntentDetectionService(options);
}
