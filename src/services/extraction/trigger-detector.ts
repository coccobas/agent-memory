/**
 * Trigger Detector - Detection Logic for Extraction Triggers
 *
 * Implements detection algorithms for each trigger type:
 * - Correction detection: Identifies when users correct agent actions
 * - Error recovery detection: Tracks errors and detects successful workarounds
 * - Enthusiasm detection: Detects positive reactions with position weighting
 * - Repetition detection: Identifies patterns across sessions using text similarity
 *
 * @module extraction/trigger-detector
 */

import { createComponentLogger } from '../../utils/logger.js';
import type {
  Message,
  TriggerEvent,
  TriggerConfig,
  SessionContext,
  ITriggerDetector,
  TriggerConfidence,
  PhraseMatchResult,
  ExtractedTriggerContent,
  TriggerContext,
} from './triggers.js';
import { TriggerType, DEFAULT_TRIGGER_CONFIG } from './triggers.js';

const logger = createComponentLogger('trigger-detector');

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Normalize text for matching by converting to lowercase and trimming.
 * @param text - Text to normalize
 * @returns Normalized text
 */
function normalizeText(text: string): string {
  return text.toLowerCase().trim();
}

/**
 * Check if text contains any of the given phrases.
 * @param text - Text to search in
 * @param phrases - Phrases to look for
 * @returns Match result with details
 */
function containsPhrase(text: string, phrases: string[]): PhraseMatchResult {
  const normalized = normalizeText(text);

  for (const phrase of phrases) {
    const normalizedPhrase = normalizeText(phrase);
    const position = normalized.indexOf(normalizedPhrase);

    if (position !== -1) {
      // Check if the phrase is at the end of the text (within last 20% of length)
      const isAtEnd = position > normalized.length * 0.8;

      return {
        matched: true,
        matchedPhrase: phrase,
        position,
        isAtEnd,
      };
    }
  }

  return { matched: false };
}

/**
 * Check if text contains negation context that would invalidate a match.
 * @param text - Text to check
 * @param matchPosition - Position of the matched phrase
 * @param negationPhrases - Phrases that indicate negation
 * @returns Whether negation context was found
 */
function hasNegationContext(
  text: string,
  matchPosition: number,
  negationPhrases: string[]
): boolean {
  const normalized = normalizeText(text);

  // Look for negation within 30 characters before the match
  const contextStart = Math.max(0, matchPosition - 30);
  const context = normalized.substring(contextStart, matchPosition);

  for (const phrase of negationPhrases) {
    if (context.includes(normalizeText(phrase))) {
      return true;
    }
  }

  return false;
}

/**
 * Check if text appears to be a question.
 * @param text - Text to check
 * @param questionIndicators - Phrases that indicate questions
 * @returns Whether text is likely a question
 */
function isQuestion(text: string, questionIndicators: string[]): boolean {
  const normalized = normalizeText(text);

  for (const indicator of questionIndicators) {
    if (normalized.includes(normalizeText(indicator))) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate simple text similarity using Jaccard coefficient on words.
 * @param text1 - First text
 * @param text2 - Second text
 * @returns Similarity score between 0 and 1
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(normalizeText(text1).split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(normalizeText(text2).split(/\s+/).filter(w => w.length > 2));

  if (words1.size === 0 || words2.size === 0) {
    return 0;
  }

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Convert numeric score to confidence level.
 * @param score - Numeric score between 0 and 1
 * @returns Confidence level
 */
function scoreToConfidence(score: number): TriggerConfidence {
  if (score >= 0.8) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

/**
 * Get current ISO timestamp.
 * @returns ISO timestamp string
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

// =============================================================================
// TRIGGER DETECTOR CLASS
// =============================================================================

/**
 * Implements trigger detection logic for all trigger types.
 * Uses configurable phrases and thresholds for detection.
 */
export class TriggerDetector implements ITriggerDetector {
  private config: TriggerConfig;

  /**
   * Create a new TriggerDetector instance.
   * @param config - Optional configuration override
   */
  constructor(config?: Partial<TriggerConfig>) {
    this.config = { ...DEFAULT_TRIGGER_CONFIG, ...config };
  }

  /**
   * Detect correction triggers in messages.
   *
   * Looks for:
   * - Correction phrases ("no", "actually", "I meant", etc.)
   * - Context indicating a previous action was wrong
   * - Extracts what was wrong and what should be right
   *
   * @param messages - Messages to analyze (most recent last)
   * @param config - Optional config override
   * @returns Trigger event if detected, null otherwise
   */
  detectCorrection(
    messages: Message[],
    config: TriggerConfig = this.config
  ): TriggerEvent | null {
    if (messages.length < 2) {
      return null;
    }

    // Get the most recent user message
    const recentUserMessages = messages.filter(m => m.role === 'user');
    if (recentUserMessages.length === 0) {
      return null;
    }

    const latestUserMessage = recentUserMessages[recentUserMessages.length - 1];
    if (!latestUserMessage) {
      return null;
    }
    const content = latestUserMessage.content;

    // Check for correction phrases
    const matchResult = containsPhrase(content, config.correctionPhrases);

    if (!matchResult.matched || !matchResult.matchedPhrase) {
      return null;
    }

    // Check for negation that would invalidate the match
    // (e.g., "that's not wrong" should not trigger)
    if (hasNegationContext(content, matchResult.position ?? 0, config.negationPhrases)) {
      logger.debug(
        { phrase: matchResult.matchedPhrase },
        'Correction phrase found but negated'
      );
      return null;
    }

    // Find the previous assistant message that might have been corrected
    const previousAssistantMessages = messages.filter(
      m => m.role === 'assistant' && m.timestamp < latestUserMessage.timestamp
    );

    if (previousAssistantMessages.length === 0) {
      return null;
    }

    const correctedMessage = previousAssistantMessages[previousAssistantMessages.length - 1];
    if (!correctedMessage) {
      return null;
    }

    // Calculate confidence based on phrase strength and context
    let score = 0.6; // Base score for any correction phrase

    // Boost for stronger correction phrases
    const strongPhrases = ['wrong', 'incorrect', 'undo', 'revert', 'that\'s not'];
    if (strongPhrases.some(p => matchResult.matchedPhrase?.toLowerCase().includes(p))) {
      score += 0.15;
    }

    // Boost if the correction is at the start of the message
    if ((matchResult.position ?? 0) < 10) {
      score += 0.1;
    }

    // Boost for shorter messages (more direct corrections)
    if (content.length < 100) {
      score += 0.05;
    }

    score = Math.min(1, score);

    if (score < config.minConfidenceScore) {
      return null;
    }

    // Extract what was wrong and what was right
    const extractedContent: ExtractedTriggerContent = {
      whatWasWrong: this.extractWhatWasWrong(correctedMessage.content, content),
      whatWasRight: this.extractWhatWasRight(content),
      rawContent: content,
    };

    const triggerContext: TriggerContext = {
      triggeringMessages: [latestUserMessage],
      previousMessages: [correctedMessage],
    };

    logger.debug(
      {
        phrase: matchResult.matchedPhrase,
        score,
        messageId: latestUserMessage.id,
      },
      'Correction trigger detected'
    );

    return {
      type: TriggerType.USER_CORRECTION,
      confidence: scoreToConfidence(score),
      score,
      reason: `User correction detected: "${matchResult.matchedPhrase}"`,
      detectedAt: getCurrentTimestamp(),
      context: triggerContext,
      suggestedEntryType: 'knowledge',
      suggestedPriority: Math.round(score * 80),
      extractedContent,
    };
  }

  /**
   * Detect error recovery triggers.
   *
   * Tracks errors in the session and detects when a successful workaround
   * is found after an error. This captures valuable debugging knowledge.
   *
   * @param messages - Messages to analyze
   * @param context - Session context with error history
   * @param config - Optional config override
   * @returns Trigger event if detected, null otherwise
   */
  detectErrorRecovery(
    messages: Message[],
    context: SessionContext,
    config: TriggerConfig = this.config
  ): TriggerEvent | null {
    // Check if there are any unrecovered errors in recent history
    const unresolvedErrors = context.recentErrors.filter(
      e => !e.recoverySuccessful && e.recoveryAttempted
    );

    if (unresolvedErrors.length === 0) {
      // Check message metadata for errors
      const errorMessages = messages.filter(
        m => m.metadata?.hasError && !m.metadata?.toolSuccess
      );

      if (errorMessages.length === 0) {
        return null;
      }
    }

    // Get recent messages after the last error
    const recentMessages = messages.slice(-config.contextWindowSize);

    // Look for success indicators after an error
    const successIndicators = [
      'works',
      'working',
      'fixed',
      'solved',
      'success',
      'done',
      'completed',
      'that did it',
      'perfect',
      'finally',
    ];

    // Check for tool success in messages
    const hasToolSuccess = recentMessages.some(
      m => m.metadata?.toolSuccess === true
    );

    // Check for verbal success indicators from user
    const userMessages = recentMessages.filter(m => m.role === 'user');
    const hasVerbalSuccess = userMessages.some(m =>
      successIndicators.some(indicator =>
        normalizeText(m.content).includes(indicator)
      )
    );

    if (!hasToolSuccess && !hasVerbalSuccess) {
      return null;
    }

    // Find the error and the recovery
    const errorMessage = messages.find(m => m.metadata?.hasError);
    const successMessage = recentMessages.find(
      m => m.metadata?.toolSuccess ||
        successIndicators.some(i => normalizeText(m.content).includes(i))
    );

    if (!errorMessage || !successMessage) {
      return null;
    }

    // Calculate confidence based on clarity of error-recovery pattern
    let score = 0.65;

    // Boost if tool explicitly succeeded after failure
    if (errorMessage.metadata?.toolName && successMessage.metadata?.toolSuccess) {
      score += 0.15;
    }

    // Boost if user explicitly confirmed success
    if (hasVerbalSuccess && hasToolSuccess) {
      score += 0.1;
    }

    score = Math.min(1, score);

    if (score < config.minConfidenceScore) {
      return null;
    }

    // Extract error and recovery information
    const extractedContent: ExtractedTriggerContent = {
      errorDescription: errorMessage.metadata?.errorMessage || errorMessage.content,
      successfulApproach: this.extractSuccessfulApproach(recentMessages, successMessage),
      rawContent: successMessage.content,
    };

    const triggerContext: TriggerContext = {
      triggeringMessages: [successMessage],
      previousMessages: [errorMessage],
      sessionId: context.sessionId,
    };

    logger.debug(
      {
        error: extractedContent.errorDescription?.slice(0, 100),
        score,
        sessionId: context.sessionId,
      },
      'Error recovery trigger detected'
    );

    return {
      type: TriggerType.ERROR_RECOVERY,
      confidence: scoreToConfidence(score),
      score,
      reason: 'Successful recovery detected after error',
      detectedAt: getCurrentTimestamp(),
      context: triggerContext,
      suggestedEntryType: 'knowledge',
      suggestedPriority: Math.round(score * 75),
      extractedContent,
    };
  }

  /**
   * Detect enthusiasm triggers in a message.
   *
   * Looks for positive reaction phrases with:
   * - Position weighting (end of message = stronger signal)
   * - False positive filtering (questions, sarcasm indicators)
   *
   * @param message - Message to analyze
   * @param config - Optional config override
   * @returns Trigger event if detected, null otherwise
   */
  detectEnthusiasm(
    message: Message,
    config: TriggerConfig = this.config
  ): TriggerEvent | null {
    // Only analyze user messages
    if (message.role !== 'user') {
      return null;
    }

    const content = message.content;

    // Skip if this looks like a question
    if (isQuestion(content, config.questionIndicators)) {
      return null;
    }

    // Check for enthusiasm phrases
    const matchResult = containsPhrase(content, config.enthusiasmPhrases);

    if (!matchResult.matched || !matchResult.matchedPhrase) {
      return null;
    }

    // Check for negation context
    if (hasNegationContext(content, matchResult.position ?? 0, config.negationPhrases)) {
      logger.debug(
        { phrase: matchResult.matchedPhrase },
        'Enthusiasm phrase found but negated'
      );
      return null;
    }

    // Calculate confidence with position weighting
    let score = 0.5; // Base score

    // Strong enthusiasm phrases get a boost
    const strongPhrases = ['perfect', 'exactly', 'love it', 'amazing', 'excellent', 'brilliant'];
    if (strongPhrases.some(p => matchResult.matchedPhrase?.toLowerCase().includes(p))) {
      score += 0.2;
    }

    // Position weight - phrases at the end are stronger signals
    if (matchResult.isAtEnd) {
      score += 0.15 * config.enthusiasmPositionWeight;
    }

    // Exclamation marks indicate stronger enthusiasm
    const exclamationCount = (content.match(/!/g) || []).length;
    if (exclamationCount > 0) {
      score += Math.min(0.1, exclamationCount * 0.03);
    }

    // Short messages with enthusiasm are typically more genuine
    if (content.length < 50) {
      score += 0.1;
    }

    // Multiple enthusiasm phrases boost confidence
    const allMatches = config.enthusiasmPhrases.filter(phrase =>
      normalizeText(content).includes(normalizeText(phrase))
    );
    if (allMatches.length > 1) {
      score += 0.1;
    }

    score = Math.min(1, score);

    if (score < config.minConfidenceScore) {
      return null;
    }

    // Extract what the user is enthusiastic about
    const extractedContent: ExtractedTriggerContent = {
      positiveAspect: this.extractPositiveAspect(content),
      rawContent: content,
    };

    const triggerContext: TriggerContext = {
      triggeringMessages: [message],
    };

    logger.debug(
      {
        phrase: matchResult.matchedPhrase,
        isAtEnd: matchResult.isAtEnd,
        score,
        messageId: message.id,
      },
      'Enthusiasm trigger detected'
    );

    return {
      type: TriggerType.ENTHUSIASM,
      confidence: scoreToConfidence(score),
      score,
      reason: `Positive reaction detected: "${matchResult.matchedPhrase}"`,
      detectedAt: getCurrentTimestamp(),
      context: triggerContext,
      suggestedEntryType: 'knowledge',
      suggestedPriority: Math.round(score * 60),
      extractedContent,
    };
  }

  /**
   * Detect repetition triggers across sessions.
   *
   * Identifies patterns that appear multiple times across sessions,
   * suggesting a recurring need or preference that should be remembered.
   *
   * @param currentMessages - Current session messages
   * @param historicalMessages - Historical messages from previous sessions
   * @param config - Optional config override
   * @returns Trigger event if detected, null otherwise
   */
  detectRepetition(
    currentMessages: Message[],
    historicalMessages: Message[],
    config: TriggerConfig = this.config
  ): TriggerEvent | null {
    if (historicalMessages.length === 0) {
      return null;
    }

    // Get user messages from current session
    const currentUserMessages = currentMessages.filter(m => m.role === 'user');
    if (currentUserMessages.length === 0) {
      return null;
    }

    // Get user messages from historical sessions
    const historicalUserMessages = historicalMessages.filter(m => m.role === 'user');
    if (historicalUserMessages.length === 0) {
      return null;
    }

    // Find the most recent user message
    const latestMessage = currentUserMessages[currentUserMessages.length - 1];
    if (!latestMessage) {
      return null;
    }

    // Find similar messages across history
    const similarMessages: Array<{ message: Message; similarity: number }> = [];

    for (const historicalMsg of historicalUserMessages) {
      const similarity = calculateTextSimilarity(
        latestMessage.content,
        historicalMsg.content
      );

      if (similarity >= config.repetitionSimilarityThreshold) {
        similarMessages.push({ message: historicalMsg, similarity });
      }
    }

    // Also check within current session (excluding the latest message itself)
    for (const currentMsg of currentUserMessages.slice(0, -1)) {
      const similarity = calculateTextSimilarity(
        latestMessage.content,
        currentMsg.content
      );

      if (similarity >= config.repetitionSimilarityThreshold) {
        similarMessages.push({ message: currentMsg, similarity });
      }
    }

    // Check if we have enough repetitions
    const totalCount = similarMessages.length + 1; // +1 for the current message

    if (totalCount < config.repetitionThreshold) {
      return null;
    }

    // Calculate confidence based on repetition count and average similarity
    const avgSimilarity =
      similarMessages.reduce((sum, m) => sum + m.similarity, 0) / similarMessages.length;

    let score = 0.6 + (totalCount - config.repetitionThreshold) * 0.1;
    score = Math.min(1, score * avgSimilarity);

    if (score < config.minConfidenceScore) {
      return null;
    }

    // Extract the repeated pattern
    const extractedContent: ExtractedTriggerContent = {
      repeatedPattern: latestMessage.content,
      repetitionCount: totalCount,
      rawContent: latestMessage.content,
    };

    // Get unique session IDs from similar messages
    const uniqueSessions = new Set(
      similarMessages
        .filter(m => m.message.metadata?.sessionId)
        .map(m => m.message.metadata?.sessionId)
    );

    const triggerContext: TriggerContext = {
      triggeringMessages: [latestMessage],
      previousMessages: similarMessages.slice(0, 3).map(m => m.message),
    };

    logger.debug(
      {
        totalCount,
        avgSimilarity,
        uniqueSessions: uniqueSessions.size,
        score,
        messageId: latestMessage.id,
      },
      'Repetition trigger detected'
    );

    return {
      type: TriggerType.REPEATED_REQUEST,
      confidence: scoreToConfidence(score),
      score,
      reason: `Pattern repeated ${totalCount} times across ${uniqueSessions.size + 1} sessions`,
      detectedAt: getCurrentTimestamp(),
      context: triggerContext,
      suggestedEntryType: 'guideline',
      suggestedPriority: Math.round(score * 70),
      extractedContent,
    };
  }

  /**
   * Detect all applicable triggers for a message.
   *
   * Runs all detection algorithms and returns all triggers that fire.
   * The caller can decide which triggers to act on.
   *
   * @param message - Message to analyze
   * @param context - Session context
   * @param config - Optional config override
   * @returns Array of detected trigger events
   */
  detectAll(
    message: Message,
    context: SessionContext,
    config: TriggerConfig = this.config
  ): TriggerEvent[] {
    const triggers: TriggerEvent[] = [];

    // Add the message to context for analysis
    const messagesWithNew = [...context.messages, message];

    // Detect correction (needs message history)
    if (message.role === 'user') {
      const correctionTrigger = this.detectCorrection(messagesWithNew, config);
      if (correctionTrigger) {
        triggers.push(correctionTrigger);
      }
    }

    // Detect error recovery
    const errorRecoveryTrigger = this.detectErrorRecovery(messagesWithNew, context, config);
    if (errorRecoveryTrigger) {
      triggers.push(errorRecoveryTrigger);
    }

    // Detect enthusiasm
    const enthusiasmTrigger = this.detectEnthusiasm(message, config);
    if (enthusiasmTrigger) {
      triggers.push(enthusiasmTrigger);
    }

    // Detect repetition (needs historical messages)
    if (context.historicalMessages && context.historicalMessages.length > 0) {
      const repetitionTrigger = this.detectRepetition(
        messagesWithNew,
        context.historicalMessages,
        config
      );
      if (repetitionTrigger) {
        triggers.push(repetitionTrigger);
      }
    }

    return triggers;
  }

  // ===========================================================================
  // PRIVATE HELPER METHODS
  // ===========================================================================

  /**
   * Extract what was wrong from a correction context.
   * @param correctedContent - Content that was corrected
   * @param correctionContent - The correction message
   * @returns Description of what was wrong
   */
  private extractWhatWasWrong(
    correctedContent: string,
    _correctionContent: string
  ): string {
    // Simple extraction: take first 200 chars of corrected content
    const truncated = correctedContent.slice(0, 200);
    return truncated.length < correctedContent.length
      ? `${truncated}...`
      : truncated;
  }

  /**
   * Extract what was right from a correction message.
   * @param correctionContent - The correction message
   * @returns Description of what should be done
   */
  private extractWhatWasRight(correctionContent: string): string {
    // Look for content after correction phrases
    const afterPhrases = [
      'instead',
      'should be',
      'should have been',
      'i meant',
      'i wanted',
      'actually',
    ];

    const normalized = normalizeText(correctionContent);

    for (const phrase of afterPhrases) {
      const index = normalized.indexOf(phrase);
      if (index !== -1) {
        const afterPhrase = correctionContent.slice(index + phrase.length).trim();
        if (afterPhrase.length > 10) {
          return afterPhrase.slice(0, 200);
        }
      }
    }

    // Default: return the correction content
    return correctionContent.slice(0, 200);
  }

  /**
   * Extract the successful approach from recovery messages.
   * @param messages - Messages around the recovery
   * @param successMessage - The message indicating success
   * @returns Description of the successful approach
   */
  private extractSuccessfulApproach(
    messages: Message[],
    successMessage: Message
  ): string {
    // Look for assistant message before the success
    const successIndex = messages.findIndex(m => m.id === successMessage.id);
    if (successIndex > 0) {
      for (let i = successIndex - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg && msg.role === 'assistant') {
          return msg.content.slice(0, 300);
        }
      }
    }

    return successMessage.content.slice(0, 200);
  }

  /**
   * Extract what the user is enthusiastic about.
   * @param content - Message content
   * @returns Description of the positive aspect
   */
  private extractPositiveAspect(content: string): string {
    // The content itself describes what the user likes
    return content.slice(0, 200);
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new TriggerDetector instance.
 * @param config - Optional configuration override
 * @returns TriggerDetector instance
 */
export function createTriggerDetector(config?: Partial<TriggerConfig>): TriggerDetector {
  return new TriggerDetector(config);
}
