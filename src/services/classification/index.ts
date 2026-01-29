/**
 * Classification Service
 *
 * Hybrid classification system that combines:
 * 1. Fast regex pattern matching (high confidence)
 * 2. LLM fallback for ambiguous cases
 * 3. Learning from corrections to improve over time
 */

import { createComponentLogger } from '../../utils/logger.js';
import type { Config } from '../../config/index.js';
import type { DrizzleDb } from '../../db/repositories/base.js';
import type { ClassificationRepository } from './classification.repository.js';
import { hashText, createClassificationRepository } from './classification.repository.js';
import { PatternMatcher, type PatternMatch } from './pattern-matcher.js';
import { LRUCache } from '../../utils/lru-cache.js';

const logger = createComponentLogger('classification');

// =============================================================================
// TYPES
// =============================================================================

export type EntryType = 'guideline' | 'knowledge' | 'tool';
export type ClassificationMethod = 'regex' | 'llm' | 'hybrid' | 'forced';

export interface ClassificationResult {
  type: EntryType;
  confidence: number;
  method: ClassificationMethod;
  patternMatches?: PatternMatch[];
  alternativeTypes?: Array<{ type: EntryType; confidence: number }>;
  llmReasoning?: string;
  adjustedByFeedback: boolean;
}

export interface ClassificationServiceConfig {
  highConfidenceThreshold: number;
  lowConfidenceThreshold: number;
  enableLLMFallback: boolean;
  preferLLM: boolean;
  feedbackDecayDays: number;
  maxPatternBoost: number;
  maxPatternPenalty: number;
  cacheSize: number;
  cacheTTLMs: number;
  learningRate: number;
}

export interface IClassificationService {
  classify(text: string, forceType?: EntryType): Promise<ClassificationResult>;
  recordCorrection(
    text: string,
    predictedType: EntryType,
    actualType: EntryType,
    sessionId?: string
  ): Promise<void>;
  getPatternStats(): Promise<
    Array<{
      patternId: string;
      patternType: EntryType;
      accuracy: number;
      feedbackMultiplier: number;
    }>
  >;
  isLLMAvailable(): boolean;
}

// Interface for extraction service (injected for LLM fallback)
export interface IExtractionServiceForClassification {
  isAvailable(): boolean;
  extractForClassification?(text: string): Promise<{
    type: EntryType;
    confidence: number;
    reasoning?: string;
  }>;
}

// =============================================================================
// CLASSIFICATION SERVICE
// =============================================================================

export class ClassificationService implements IClassificationService {
  private repo: ClassificationRepository;
  private patternMatcher: PatternMatcher;
  private cache: LRUCache<ClassificationResult>;
  private extractionService: IExtractionServiceForClassification | null;
  private config: ClassificationServiceConfig;

  constructor(
    db: DrizzleDb,
    extractionService: IExtractionServiceForClassification | null,
    config: ClassificationServiceConfig
  ) {
    this.repo = createClassificationRepository(db);
    this.patternMatcher = new PatternMatcher(this.repo, config);
    this.extractionService = extractionService;
    this.config = config;

    this.cache = new LRUCache<ClassificationResult>({
      maxSize: config.cacheSize,
      ttlMs: config.cacheTTLMs,
    });

    logger.info(
      {
        llmAvailable: this.isLLMAvailable(),
        highThreshold: config.highConfidenceThreshold,
        lowThreshold: config.lowConfidenceThreshold,
      },
      'Classification service initialized'
    );
  }

  /**
   * Check if LLM fallback is available
   */
  isLLMAvailable(): boolean {
    return (
      this.config.enableLLMFallback &&
      this.extractionService !== null &&
      this.extractionService.isAvailable()
    );
  }

  /**
   * Classify text into entry type
   */
  async classify(text: string, forceType?: EntryType): Promise<ClassificationResult> {
    // 1. Force type always wins
    if (forceType) {
      logger.debug({ forceType }, 'Using forced type');
      return {
        type: forceType,
        confidence: 1.0,
        method: 'forced',
        adjustedByFeedback: false,
      };
    }

    // 2. Check cache
    const cacheKey = hashText(text);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.debug({ type: cached.type, confidence: cached.confidence }, 'Cache hit');
      return cached;
    }

    // 3. ALWAYS check patterns first - if very high confidence (>= 0.95), trust patterns
    // This catches CLI commands like "npm run build..." which patterns detect reliably
    const regexResult = await this.patternMatcher.match(text);
    const VERY_HIGH_CONFIDENCE = 0.95;

    // Apply penalty if guideline contains bug keywords without prescriptive language
    let adjustedConfidence = regexResult.confidence;
    if (regexResult.type === 'guideline') {
      const bugKeywords =
        /\b(bug|issue|broken|error|doesn't work|not working|problem with|fails|crashing)\b/i;
      const prescriptiveWords =
        /\b(must|should|always|never|use|avoid|prefer|require|recommend)\b/i;

      if (bugKeywords.test(text) && !prescriptiveWords.test(text)) {
        adjustedConfidence *= 0.3;
        logger.debug(
          { originalConfidence: regexResult.confidence, adjustedConfidence },
          'Penalized guideline confidence due to bug keywords without prescriptive language'
        );
      }
    }

    if (adjustedConfidence >= VERY_HIGH_CONFIDENCE) {
      logger.debug(
        { type: regexResult.type, confidence: adjustedConfidence },
        'Very high confidence pattern match - skipping LLM'
      );
      const result: ClassificationResult = {
        ...regexResult,
        confidence: adjustedConfidence,
        method: 'regex',
      };
      this.cache.set(cacheKey, result);
      return result;
    }

    // 4. LLM-first mode: use LLM when available and preferred (for non-obvious cases)
    if (this.config.preferLLM && this.isLLMAvailable()) {
      logger.debug('Using LLM-first classification');
      const llmResult = await this.classifyWithLLM(text);
      if (llmResult) {
        const result: ClassificationResult = {
          type: llmResult.type,
          confidence: llmResult.confidence,
          method: 'llm',
          llmReasoning: llmResult.reasoning,
          adjustedByFeedback: false,
        };
        this.cache.set(cacheKey, result);
        return result;
      }
      logger.debug('LLM classification failed, falling back to regex');
    }

    // 5. High confidence → use regex directly
    if (adjustedConfidence >= this.config.highConfidenceThreshold) {
      logger.debug(
        { type: regexResult.type, confidence: adjustedConfidence },
        'High confidence regex match'
      );
      const result: ClassificationResult = {
        ...regexResult,
        confidence: adjustedConfidence,
        method: 'regex',
      };
      this.cache.set(cacheKey, result);
      return result;
    }

    // 6. Low confidence → LLM fallback if available (and not already tried)
    if (
      !this.config.preferLLM &&
      adjustedConfidence < this.config.lowConfidenceThreshold &&
      this.isLLMAvailable()
    ) {
      logger.debug({ regexConfidence: adjustedConfidence }, 'Low confidence, using LLM fallback');
      const llmResult = await this.classifyWithLLM(text);
      if (llmResult) {
        const result: ClassificationResult = {
          type: llmResult.type,
          confidence: llmResult.confidence,
          method: 'llm',
          llmReasoning: llmResult.reasoning,
          alternativeTypes: this.buildAlternativesFromMatches(
            llmResult.type,
            regexResult.patternMatches
          ),
          adjustedByFeedback: false,
        };
        this.cache.set(cacheKey, result);
        return result;
      }
    }

    // 6. Middle zone → LLM verification if available
    if (this.isLLMAvailable()) {
      logger.debug(
        { regexConfidence: adjustedConfidence },
        'Middle confidence, verifying with LLM'
      );
      const llmResult = await this.classifyWithLLM(text);
      if (llmResult) {
        // If LLM agrees with regex, boost confidence
        if (llmResult.type === regexResult.type) {
          const result: ClassificationResult = {
            ...regexResult,
            confidence: Math.min(0.95, adjustedConfidence + 0.1),
            method: 'hybrid',
            llmReasoning: llmResult.reasoning,
          };
          this.cache.set(cacheKey, result);
          return result;
        }

        // LLM disagrees, use LLM result (it's smarter)
        const result: ClassificationResult = {
          type: llmResult.type,
          confidence: llmResult.confidence,
          method: 'hybrid',
          llmReasoning: llmResult.reasoning,
          alternativeTypes: [{ type: regexResult.type, confidence: adjustedConfidence }],
          adjustedByFeedback: false,
        };
        this.cache.set(cacheKey, result);
        return result;
      }
    }

    // 7. Fallback to regex result
    logger.debug(
      { type: regexResult.type, confidence: adjustedConfidence },
      'Using regex result (LLM unavailable or failed)'
    );
    const result: ClassificationResult = {
      type: regexResult.type,
      confidence: adjustedConfidence,
      method: 'regex',
      patternMatches: regexResult.patternMatches,
      adjustedByFeedback: regexResult.adjustedByFeedback,
      alternativeTypes: this.buildAlternativesFromMatches(
        regexResult.type,
        regexResult.patternMatches
      ),
    };
    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Record a correction when forceType differs from prediction
   */
  async recordCorrection(
    text: string,
    predictedType: EntryType,
    actualType: EntryType,
    sessionId?: string
  ): Promise<void> {
    if (predictedType === actualType) {
      return; // No correction needed
    }

    const textHash = hashText(text);

    // Get the pattern matches to know which patterns to penalize
    const patternResult = await this.patternMatcher.match(text);

    // Record feedback
    await this.repo.recordFeedback({
      textHash,
      textPreview: text.slice(0, 100),
      sessionId,
      predictedType,
      actualType,
      method: 'regex', // Corrections come from regex predictions
      confidence: patternResult.confidence,
      matchedPatterns: patternResult.patternMatches?.map((m) => m.patternId),
    });

    // Update pattern confidence for matched patterns (negative feedback)
    if (patternResult.patternMatches) {
      for (const match of patternResult.patternMatches) {
        if (match.type === predictedType) {
          // This pattern predicted incorrectly
          await this.patternMatcher.updatePatternConfidence(match.patternId, false);
        }
      }
    }

    // Invalidate cache for this text
    this.cache.delete(textHash);

    logger.info(
      { predicted: predictedType, actual: actualType, textHash },
      'Classification correction recorded'
    );
  }

  /**
   * Get statistics for all patterns
   */
  async getPatternStats(): Promise<
    Array<{
      patternId: string;
      patternType: EntryType;
      accuracy: number;
      feedbackMultiplier: number;
    }>
  > {
    const stats = await this.repo.getPatternStats();
    return stats.map((s) => ({
      patternId: s.patternId,
      patternType: s.patternType,
      accuracy: s.accuracy,
      feedbackMultiplier: s.feedbackMultiplier,
    }));
  }

  private async classifyWithLLM(
    text: string
  ): Promise<{ type: EntryType; confidence: number; reasoning?: string } | null> {
    if (!this.extractionService?.extractForClassification) {
      logger.debug('Extraction service does not support classification');
      return null;
    }

    const LLM_TIMEOUT_MS = 10000;

    try {
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('LLM classification timeout')), LLM_TIMEOUT_MS);
      });

      const result = await Promise.race([
        this.extractionService.extractForClassification(text),
        timeoutPromise,
      ]);
      return result;
    } catch (error) {
      const isTimeout = error instanceof Error && error.message === 'LLM classification timeout';
      logger.warn(
        { error: error instanceof Error ? error.message : String(error), isTimeout },
        isTimeout ? 'LLM classification timed out' : 'LLM classification failed'
      );
      return null;
    }
  }

  /**
   * Build alternative type suggestions from pattern matches
   */
  private buildAlternativesFromMatches(
    primaryType: EntryType,
    patternMatches?: PatternMatch[]
  ): Array<{ type: EntryType; confidence: number }> {
    if (!patternMatches || patternMatches.length <= 1) {
      return [];
    }

    // Get unique types from pattern matches, excluding the primary type
    const typeScores = new Map<EntryType, number>();

    for (const match of patternMatches) {
      if (match.type !== primaryType) {
        const current = typeScores.get(match.type) ?? 0;
        typeScores.set(match.type, Math.max(current, match.adjustedScore));
      }
    }

    return Array.from(typeScores.entries())
      .map(([type, confidence]) => ({ type, confidence }))
      .sort((a, b) => b.confidence - a.confidence);
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a classification service from app config
 */
export function createClassificationService(
  db: DrizzleDb,
  appConfig: Config,
  extractionService: IExtractionServiceForClassification | null
): ClassificationService {
  const config: ClassificationServiceConfig = {
    highConfidenceThreshold: appConfig.classification.highConfidenceThreshold,
    lowConfidenceThreshold: appConfig.classification.lowConfidenceThreshold,
    enableLLMFallback: appConfig.classification.enableLLMFallback,
    preferLLM: appConfig.classification.preferLLM,
    feedbackDecayDays: appConfig.classification.feedbackDecayDays,
    maxPatternBoost: appConfig.classification.maxPatternBoost,
    maxPatternPenalty: appConfig.classification.maxPatternPenalty,
    cacheSize: appConfig.classification.cacheSize,
    cacheTTLMs: appConfig.classification.cacheTTLMs,
    learningRate: appConfig.classification.learningRate,
  };

  return new ClassificationService(db, extractionService, config);
}

// Re-exports
export { hashText } from './classification.repository.js';
export type { PatternMatch } from './pattern-matcher.js';
