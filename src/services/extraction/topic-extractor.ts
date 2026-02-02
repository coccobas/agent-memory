/**
 * Topic Name Extraction Service
 *
 * Extracts topic names from user messages using LLM with fallback to generic names.
 * Non-blocking: returns immediately with fallback, enriches async in background.
 *
 * Flow:
 * 1. Validate input (empty/null → fallback)
 * 2. Try LLM extraction with timeout (100ms)
 * 3. If LLM fails/times out → fallback to "Topic #N"
 * 4. Trigger background enrichment for generic names
 *
 * @module extraction/topic-extractor
 */

import { createComponentLogger } from '../../utils/logger.js';
import type { ClassifierService } from './classifier.service.js';
import { getDefaultClassifierService } from './classifier.service.js';

const logger = createComponentLogger('topic-extractor');

// =============================================================================
// TYPES
// =============================================================================

export interface TopicExtractionResult {
  name: string;
  isGeneric: boolean;
  source: 'llm' | 'fallback';
  confidence?: number;
}

export interface TopicExtractorConfig {
  /** Timeout for LLM extraction in ms (default: 100) */
  timeoutMs: number;
  /** Enable LLM extraction (default: true) */
  enabled: boolean;
  /** Enable background enrichment (default: true) */
  enrichmentEnabled: boolean;
}

export const DEFAULT_TOPIC_EXTRACTOR_CONFIG: TopicExtractorConfig = {
  timeoutMs: 100,
  enabled: true,
  enrichmentEnabled: true,
};

// =============================================================================
// TOPIC COUNTER
// =============================================================================

/**
 * In-memory counter for sequential topic numbering.
 * Starts at 0, increments on each fallback.
 */
let topicCounter = 0;

/**
 * Get next generic topic name with sequential numbering.
 * @returns "Topic #1", "Topic #2", etc.
 */
function getNextGenericName(): string {
  topicCounter++;
  return `Topic #${topicCounter}`;
}

/**
 * Reset topic counter (for testing).
 */
export function resetTopicCounter(): void {
  topicCounter = 0;
}

// =============================================================================
// LLM EXTRACTION PROMPT
// =============================================================================

/**
 * Prompt for extracting topic name from user message.
 * Designed for fast inference with no-think mode.
 */
const TOPIC_EXTRACTION_PROMPT = `/no_think
Extract a concise topic name (3-6 words) from the user message.

## Guidelines
- Focus on the main task/goal
- Remove filler words ("I need to", "Can you", "How do I")
- Keep technical terms and specifics
- Use imperative form when possible ("Fix bug", "Implement feature")
- Max 6 words

## Examples
"Fix the authentication bug in login flow" → "Fix auth bug"
"I need to implement semantic search for markets" → "Implement semantic search"
"How can we optimize database queries?" → "Optimize database queries"
"Can you help me refactor the API endpoints?" → "Refactor API endpoints"

## User Message
"{TEXT}"

Respond with JSON only: {"name":"..."}`;

// =============================================================================
// TOPIC EXTRACTOR
// =============================================================================

export class TopicExtractor {
  private config: TopicExtractorConfig;
  private classifier: ClassifierService;
  private enrichmentQueue: Array<{ name: string; message: string }> = [];

  constructor(config?: Partial<TopicExtractorConfig>, classifier?: ClassifierService) {
    this.config = { ...DEFAULT_TOPIC_EXTRACTOR_CONFIG, ...config };
    this.classifier = classifier ?? getDefaultClassifierService();
  }

  /**
   * Extract topic name from user message.
   * Non-blocking: returns immediately with fallback if LLM unavailable/slow.
   *
   * @param userMessage - User's message to extract topic from
   * @returns Topic name (LLM-extracted or generic fallback)
   */
  async extractTopicName(userMessage: string): Promise<string> {
    // Validate input
    if (!userMessage || userMessage.trim() === '') {
      logger.debug('Empty user message, using fallback');
      return getNextGenericName();
    }

    // Try LLM extraction with timeout
    if (this.config.enabled && this.classifier.isAvailable()) {
      try {
        const result = await Promise.race([
          this.extractWithLLM(userMessage),
          this.timeout(this.config.timeoutMs),
        ]);

        if (result && result.trim()) {
          logger.debug({ name: result, source: 'llm' }, 'Topic name extracted via LLM');
          return result;
        }
      } catch (error) {
        logger.debug(
          { error: error instanceof Error ? error.message : String(error) },
          'LLM extraction failed, using fallback'
        );
      }
    }

    // Fallback to generic name
    const genericName = getNextGenericName();
    logger.debug({ name: genericName, source: 'fallback' }, 'Using generic topic name');

    // Trigger background enrichment (async, don't wait)
    if (this.config.enrichmentEnabled) {
      this.enrichTopicNameInBackground(genericName, userMessage).catch((err) => {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err) },
          'Background enrichment failed'
        );
      });
    }

    return genericName;
  }

  /**
   * Extract topic name using LLM.
   * @private
   */
  private async extractWithLLM(userMessage: string): Promise<string | null> {
    // Truncate very long messages (keep first 500 chars)
    const truncated = userMessage.length > 500 ? userMessage.slice(0, 500) : userMessage;

    const prompt = TOPIC_EXTRACTION_PROMPT.replace('{TEXT}', truncated);

    try {
      const result = await this.classifier.classify(prompt);

      // Parse JSON response
      if (result.reasoning) {
        try {
          const parsed = JSON.parse(result.reasoning) as { name?: string };
          if (parsed.name && parsed.name.trim()) {
            return parsed.name.trim();
          }
        } catch {
          // If JSON parsing fails, try to extract name from reasoning text
          const match = result.reasoning.match(/"name"\s*:\s*"([^"]+)"/);
          if (match && match[1]) {
            return match[1].trim();
          }
        }
      }

      return null;
    } catch (error) {
      logger.debug(
        { error: error instanceof Error ? error.message : String(error) },
        'LLM extraction error'
      );
      return null;
    }
  }

  /**
   * Timeout helper for Promise.race.
   * @private
   */
  private timeout(ms: number): Promise<null> {
    return new Promise((resolve) => setTimeout(() => resolve(null), ms));
  }

  /**
   * Trigger background enrichment for generic topic name.
   * Queues enrichment job to improve generic name later.
   * @private
   */
  private async enrichTopicNameInBackground(
    genericName: string,
    userMessage: string
  ): Promise<void> {
    // Queue enrichment (in real implementation, this would trigger a background job)
    this.enrichmentQueue.push({ name: genericName, message: userMessage });

    logger.debug(
      { genericName, queueSize: this.enrichmentQueue.length },
      'Queued topic name for enrichment'
    );

    // TODO: Implement actual background enrichment service
    // For now, just log the intent
    // In production, this would:
    // 1. Queue job in background worker
    // 2. Re-run LLM extraction with more time
    // 3. Update topic name in database if better name found
  }

  /**
   * Get enrichment queue (for testing).
   */
  getEnrichmentQueue(): Array<{ name: string; message: string }> {
    return [...this.enrichmentQueue];
  }

  /**
   * Clear enrichment queue (for testing).
   */
  clearEnrichmentQueue(): void {
    this.enrichmentQueue = [];
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let defaultTopicExtractor: TopicExtractor | null = null;

export function createTopicExtractor(
  config?: Partial<TopicExtractorConfig>,
  classifier?: ClassifierService
): TopicExtractor {
  return new TopicExtractor(config, classifier);
}

export function getDefaultTopicExtractor(): TopicExtractor {
  if (!defaultTopicExtractor) {
    defaultTopicExtractor = new TopicExtractor();
  }
  return defaultTopicExtractor;
}

export function resetDefaultTopicExtractor(): void {
  defaultTopicExtractor = null;
}

// =============================================================================
// CONVENIENCE FUNCTION
// =============================================================================

/**
 * Extract topic name from user message (convenience function).
 * Uses default topic extractor singleton.
 *
 * @param userMessage - User's message to extract topic from
 * @returns Topic name (LLM-extracted or generic fallback)
 */
export async function extractTopicName(userMessage: string): Promise<string> {
  const extractor = getDefaultTopicExtractor();
  return extractor.extractTopicName(userMessage);
}
