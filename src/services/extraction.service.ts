/**
 * Refactored extraction service using provider pattern
 *
 * Supports:
 * - OpenAI API (GPT-4o-mini, GPT-4o, etc.)
 * - Anthropic API (Claude 3.5 Sonnet, etc.)
 * - Local LLM via Ollama
 * - Disabled mode (returns empty extractions)
 *
 * Architecture: Provider pattern with circuit breaker protection
 */

import { createComponentLogger } from '../utils/logger.js';
import { CircuitBreaker } from '../utils/circuit-breaker.js';
import { config } from '../config/index.js';
import {
  createValidationError,
  createExtractionError,
  createSizeLimitError,
} from '../core/errors.js';
import { ensureAtomicity, createAtomicityConfig } from './extraction/atomicity.js';
import { OpenAIProvider } from './extraction/providers/openai.provider.js';
import { AnthropicProvider } from './extraction/providers/anthropic.provider.js';
import { OllamaProvider } from './extraction/providers/ollama.provider.js';
import type {
  IExtractionProvider,
  ExtractionInput,
  ExtractionResult,
  GenerationInput,
  GenerationResult,
  ExtractionProvider,
} from './extraction/providers/types.js';

const logger = createComponentLogger('extraction');

// Valid contextType values for runtime validation
const VALID_CONTEXT_TYPES = ['conversation', 'code', 'mixed'] as const;
type ContextType = (typeof VALID_CONTEXT_TYPES)[number];

// Configuration interface for ExtractionService
export interface ExtractionServiceConfig {
  provider: ExtractionProvider;
  openaiApiKey?: string;
  openaiModel: string;
  openaiBaseUrl?: string;
  strictBaseUrlAllowlist?: boolean;
  anthropicApiKey?: string;
  anthropicModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
}

// Re-export types for backward compatibility
export type {
  ExtractionProvider,
  ExtractionInput,
  ExtractionResult,
  GenerationInput,
  GenerationResult,
  ExtractedEntry,
  ExtractedEntity,
  ExtractedRelationship,
  EntityType,
  ExtractedRelationType,
} from './extraction/providers/types.js';

// Static warning state for test isolation
const warningState = {
  hasWarnedDisabled: false,
  hasWarnedTokens: false,
};

/**
 * ExtractionService - orchestrates LLM-based memory extraction
 *
 * Uses provider pattern to support multiple LLM backends while
 * providing unified API with circuit breaker protection.
 */
export class ExtractionService {
  private provider: ExtractionProvider;
  private extractionProvider: IExtractionProvider | null = null;
  private circuitBreaker: CircuitBreaker;

  /**
   * Reset warning state for test isolation.
   * Call this in test setup/teardown to ensure clean state between tests.
   */
  static resetWarningState(): void {
    warningState.hasWarnedDisabled = false;
    warningState.hasWarnedTokens = false;
  }

  /**
   * Create an ExtractionService instance
   * @param serviceConfig - Optional explicit configuration. If not provided, uses global config.
   */
  constructor(serviceConfig?: ExtractionServiceConfig) {
    // Use explicit config if provided, otherwise fall back to global config
    const effectiveConfig: ExtractionServiceConfig = serviceConfig ?? {
      provider: config.extraction.provider,
      openaiApiKey: config.extraction.openaiApiKey,
      openaiModel: config.extraction.openaiModel,
      openaiBaseUrl: config.extraction.openaiBaseUrl,
      strictBaseUrlAllowlist: config.extraction.strictBaseUrlAllowlist,
      anthropicApiKey: config.extraction.anthropicApiKey,
      anthropicModel: config.extraction.anthropicModel,
      ollamaBaseUrl: config.extraction.ollamaBaseUrl,
      ollamaModel: config.extraction.ollamaModel,
    };

    this.provider = effectiveConfig.provider;

    // Warn once globally if disabled
    if (this.provider === 'disabled' && !warningState.hasWarnedDisabled) {
      logger.warn(
        'Extraction provider is disabled. Set AGENT_MEMORY_EXTRACTION_PROVIDER to enable.'
      );
      warningState.hasWarnedDisabled = true;
    }

    // Initialize appropriate provider
    if (this.provider !== 'disabled') {
      this.extractionProvider = this.createProvider(effectiveConfig);
    }

    // Initialize circuit breaker for rate limiting and failure protection
    this.circuitBreaker = new CircuitBreaker({
      name: 'extraction-service',
      failureThreshold: config.circuitBreaker.failureThreshold,
      resetTimeoutMs: config.circuitBreaker.resetTimeoutMs,
      successThreshold: config.circuitBreaker.successThreshold,
      isFailure: (error: Error) => {
        // Only count extraction failures, not validation errors
        return !(error.name === 'ValidationError');
      },
    });
  }

  /**
   * Create the appropriate extraction provider based on configuration.
   * Returns null if required API keys are missing (matching original behavior).
   */
  private createProvider(effectiveConfig: ExtractionServiceConfig): IExtractionProvider | null {
    switch (this.provider) {
      case 'openai':
        // Only create provider if API key is available (matches original behavior)
        if (!effectiveConfig.openaiApiKey) {
          return null;
        }
        return new OpenAIProvider(
          effectiveConfig.openaiApiKey,
          effectiveConfig.openaiModel,
          effectiveConfig.openaiBaseUrl,
          effectiveConfig.strictBaseUrlAllowlist ?? true
        );

      case 'anthropic':
        // Only create provider if API key is available (matches original behavior)
        if (!effectiveConfig.anthropicApiKey) {
          return null;
        }
        return new AnthropicProvider(
          effectiveConfig.anthropicApiKey,
          effectiveConfig.anthropicModel
        );

      case 'ollama':
        return new OllamaProvider(effectiveConfig.ollamaBaseUrl, effectiveConfig.ollamaModel);

      default:
        logger.warn({ provider: this.provider }, 'Unsupported extraction provider');
        return null;
    }
  }

  /**
   * Get the current extraction provider
   */
  getProvider(): ExtractionProvider {
    return this.provider;
  }

  /**
   * Check if extraction is available.
   * Returns true only if provider is not disabled AND was successfully initialized.
   */
  isAvailable(): boolean {
    return this.provider !== 'disabled' && this.extractionProvider !== null;
  }

  /**
   * Extract memory entries from context
   */
  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    // Return empty result if provider is disabled or couldn't be initialized
    if (this.provider === 'disabled' || !this.extractionProvider) {
      return {
        entries: [],
        entities: [],
        relationships: [],
        model: this.provider === 'disabled' ? 'disabled' : 'unavailable',
        provider: this.provider === 'disabled' ? 'disabled' : this.provider,
        processingTimeMs: 0,
      };
    }

    // Validate input: context cannot be empty
    if (!input.context || input.context.trim().length === 0) {
      throw createValidationError('context', 'cannot be empty');
    }

    // Security: Prevent DoS and API quota exhaustion with large context
    const maxContextLength = config.extraction.maxContextLength;
    if (input.context.length > maxContextLength) {
      throw createSizeLimitError('context', maxContextLength, input.context.length, 'characters');
    }

    // Validate contextType
    if (input.contextType && !VALID_CONTEXT_TYPES.includes(input.contextType as ContextType)) {
      throw createValidationError(
        'contextType',
        `invalid contextType: "${input.contextType}". Must be one of: ${VALID_CONTEXT_TYPES.join(', ')}`
      );
    }

    // Warn about large context sizes
    if (input.context.length > 50000 && !warningState.hasWarnedTokens) {
      logger.warn(
        { contextLength: input.context.length },
        'Large context detected. This may exceed model token limits and cause truncation.'
      );
      warningState.hasWarnedTokens = true;
    }

    // Execute with circuit breaker protection
    return this.circuitBreaker.execute(async () => {
      const startTime = Date.now();

      if (!this.extractionProvider) {
        throw createExtractionError('service', 'No extraction provider initialized');
      }

      try {
        const result = await this.extractionProvider.extract(input);

        // Set processing time
        result.processingTimeMs = Date.now() - startTime;

        // Apply atomicity validation if enabled in config
        if (config.extraction.atomicityEnabled) {
          const atomicityConfig = createAtomicityConfig(config.extraction);
          const originalCount = result.entries.length;
          result.entries = ensureAtomicity(result.entries, atomicityConfig);

          if (result.entries.length !== originalCount) {
            logger.info(
              {
                originalCount,
                atomicCount: result.entries.length,
                splitMode: config.extraction.atomicitySplitMode,
              },
              'Atomicity processing applied'
            );
          }
        }

        return result;
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            provider: this.provider,
            model: this.extractionProvider.getModel(),
            contextLength: input.context.length,
            processingTimeMs: Date.now() - startTime,
          },
          'Extraction failed'
        );
        throw error;
      }
    });
  }

  /**
   * Generate text variations (e.g., for guideline examples)
   */
  async generate(input: GenerationInput): Promise<GenerationResult> {
    // Return empty result if provider is disabled or couldn't be initialized
    if (this.provider === 'disabled' || !this.extractionProvider) {
      return {
        texts: [],
        model: this.provider === 'disabled' ? 'disabled' : 'unavailable',
        provider: this.provider === 'disabled' ? 'disabled' : this.provider,
        processingTimeMs: 0,
      };
    }

    return this.circuitBreaker.execute(async () => {
      const startTime = Date.now();

      if (!this.extractionProvider) {
        throw createExtractionError('service', 'No extraction provider initialized');
      }

      try {
        const result = await this.extractionProvider.generate(input);

        // Set processing time
        result.processingTimeMs = Date.now() - startTime;

        return result;
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            provider: this.provider,
            model: this.extractionProvider.getModel(),
            processingTimeMs: Date.now() - startTime,
          },
          'Generation failed'
        );
        throw error;
      }
    });
  }

  /**
   * Extract from multiple contexts in batch with controlled concurrency
   */
  async extractBatch(
    inputs: ExtractionInput[],
    options?: {
      /** Max concurrent extractions (default: 3). Use lower values for large batches. */
      concurrency?: number;
      /** Continue on individual errors (default: true) */
      continueOnError?: boolean;
    }
  ): Promise<Array<ExtractionResult | { error: string; index: number }>> {
    const concurrency = options?.concurrency ?? 3;

    // Warn about potential connection pool exhaustion with large batches
    if (inputs.length > 100) {
      logger.warn(
        {
          inputCount: inputs.length,
          concurrency,
          recommendedConcurrency: Math.min(2, concurrency),
        },
        'Large batch extraction detected. Consider reducing concurrency to prevent connection pool exhaustion.'
      );
    }

    const continueOnError = options?.continueOnError ?? true;

    if (inputs.length === 0) {
      return [];
    }

    if (this.provider === 'disabled') {
      return inputs.map(() => ({
        entries: [],
        entities: [],
        relationships: [],
        model: 'disabled',
        provider: 'disabled',
        processingTimeMs: 0,
      }));
    }

    const startTime = Date.now();
    logger.info({ inputCount: inputs.length, concurrency }, 'Starting batch extraction');

    const results: Array<ExtractionResult | { error: string; index: number }> = new Array<
      ExtractionResult | { error: string; index: number }
    >(inputs.length);
    let processedCount = 0;
    let errorCount = 0;

    // Process in batches of 'concurrency' size
    for (let i = 0; i < inputs.length; i += concurrency) {
      const batch = inputs.slice(i, i + concurrency);
      const batchPromises = batch.map(async (input, batchIndex) => {
        const globalIndex = i + batchIndex;
        try {
          const result = await this.extract(input);
          results[globalIndex] = result;
          processedCount++;
        } catch (error) {
          errorCount++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(
            { error: errorMessage, index: globalIndex },
            'Batch extraction failed for input'
          );

          if (continueOnError) {
            results[globalIndex] = { error: errorMessage, index: globalIndex };
          } else {
            throw error;
          }
        }
      });

      await Promise.all(batchPromises);
    }

    const totalTimeMs = Date.now() - startTime;
    logger.info(
      {
        total: inputs.length,
        processed: processedCount,
        errors: errorCount,
        totalTimeMs,
        avgTimeMs: Math.round(totalTimeMs / inputs.length),
      },
      'Batch extraction completed'
    );

    return results;
  }
}

/**
 * Create a default ExtractionService instance using global config
 */
export function createExtractionService(
  serviceConfig?: ExtractionServiceConfig
): ExtractionService {
  return new ExtractionService(serviceConfig);
}

/**
 * @deprecated This function is no longer needed. Use ExtractionService.resetWarningState() instead.
 */
export function resetExtractionServiceState(): void {
  ExtractionService.resetWarningState();
}
