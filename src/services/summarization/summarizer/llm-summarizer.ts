/**
 * LLM Summarizer for Hierarchical Memory Summarization
 *
 * Supports multiple LLM providers (OpenAI, Anthropic, Ollama) with level-aware prompts
 * and graceful fallback when LLM is not available.
 */

import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { createComponentLogger } from '../../../utils/logger.js';
import { withRetry, isRetryableNetworkError } from '../../../utils/retry.js';
import {
  createValidationError,
  createSizeLimitError,
  createServiceUnavailableError,
} from '../../../core/errors.js';
import type {
  SummarizationRequest,
  SummarizationResult,
  BatchSummarizationResult,
  SummarizerConfig,
  LLMProvider,
  HierarchyLevel,
  PromptVariables,
} from './types.js';
import { DEFAULT_SUMMARIZER_CONFIG, HIERARCHY_LEVEL_NAMES } from './types.js';
import { buildPrompts, getFallbackSummary } from './prompts.js';

const logger = createComponentLogger('summarizer');

// Security constants (aligned with extraction service)
const MAX_CONTEXT_LENGTH = 100000; // 100KB limit
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10MB max response

/**
 * Validate model name to prevent injection attacks
 */
function isValidModelName(modelName: string): boolean {
  const validPattern = /^[a-zA-Z0-9._:-]+$/;
  return validPattern.test(modelName) && modelName.length <= 100;
}

/**
 * Read response body with size limit to prevent memory exhaustion
 */
async function readResponseWithLimit(
  response: Response,
  maxSizeBytes: number,
  abortController: AbortController
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw createValidationError('response.body', 'is not readable');
  }

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > maxSizeBytes) {
        abortController.abort();
        throw createSizeLimitError('response', maxSizeBytes, totalBytes, 'bytes');
      }

      chunks.push(decoder.decode(value, { stream: true }));
    }

    chunks.push(decoder.decode());
    return chunks.join('');
  } finally {
    reader.releaseLock();
  }
}

/**
 * LLM Summarizer
 *
 * Generates hierarchical summaries using configurable LLM providers with
 * level-aware prompts for optimal results at each hierarchy level.
 *
 * @example
 * ```typescript
 * const summarizer = new LLMSummarizer({
 *   provider: 'openai',
 *   openaiApiKey: process.env.OPENAI_API_KEY,
 *   maxTokens: 1024,
 *   temperature: 0.3
 * });
 *
 * const result = await summarizer.summarize({
 *   items: [
 *     { id: '1', type: 'knowledge', title: 'DB Setup', content: 'Using PostgreSQL...' },
 *     { id: '2', type: 'knowledge', title: 'Migration', content: 'Migrated to PG 15...' }
 *   ],
 *   hierarchyLevel: 1,
 *   scopeContext: 'Backend Database'
 * });
 * ```
 */
export class LLMSummarizer {
  private config: Required<SummarizerConfig>;
  private openaiClient: OpenAI | null = null;
  private anthropicClient: Anthropic | null = null;

  /**
   * Create a new LLM summarizer
   *
   * @param config - Summarizer configuration
   */
  constructor(config: SummarizerConfig) {
    // Merge with defaults
    this.config = {
      ...DEFAULT_SUMMARIZER_CONFIG,
      ...config,
      // Set default model based on provider if not specified
      model:
        config.model ||
        this.getDefaultModel(config.provider || DEFAULT_SUMMARIZER_CONFIG.provider),
    } as Required<SummarizerConfig>;

    // Validate model name
    if (this.config.model && !isValidModelName(this.config.model)) {
      throw createValidationError(
        'model',
        `invalid model name "${this.config.model}"`,
        'Model names must only contain alphanumeric characters, hyphens, underscores, colons, and dots'
      );
    }

    // Initialize clients based on provider
    this.initializeClients();

    logger.debug(
      { provider: this.config.provider, model: this.config.model },
      'LLM summarizer initialized'
    );
  }

  /**
   * Get default model for a provider
   */
  private getDefaultModel(provider: LLMProvider): string {
    switch (provider) {
      case 'openai':
        return 'gpt-4o-mini';
      case 'anthropic':
        return 'claude-3-5-haiku-20241022'; // Fast, cost-effective for summarization
      case 'ollama':
        return 'llama3.2';
      case 'disabled':
        return 'none';
    }
  }

  /**
   * Initialize LLM clients based on configuration
   */
  private initializeClients(): void {
    switch (this.config.provider) {
      case 'openai':
        if (!this.config.openaiApiKey) {
          throw createValidationError(
            'openaiApiKey',
            'is required when provider is "openai"',
            'Set openaiApiKey in config or use a different provider'
          );
        }
        this.openaiClient = new OpenAI({
          apiKey: this.config.openaiApiKey,
          baseURL: this.config.openaiBaseUrl,
          timeout: 120000, // 120 second timeout
          maxRetries: 0, // We handle retries with withRetry
        });
        break;

      case 'anthropic':
        if (!this.config.anthropicApiKey) {
          throw createValidationError(
            'anthropicApiKey',
            'is required when provider is "anthropic"',
            'Set anthropicApiKey in config or use a different provider'
          );
        }
        this.anthropicClient = new Anthropic({
          apiKey: this.config.anthropicApiKey,
          timeout: 120000,
          maxRetries: 0,
        });
        break;

      case 'ollama':
        // No client needed for Ollama, we use fetch directly
        if (!this.config.ollamaBaseUrl) {
          this.config.ollamaBaseUrl = 'http://localhost:11434';
        }
        break;

      case 'disabled':
        // No initialization needed
        break;
    }
  }

  /**
   * Check if summarizer is available
   *
   * @returns True if provider is not disabled
   */
  isAvailable(): boolean {
    return this.config.provider !== 'disabled';
  }

  /**
   * Get current provider
   */
  getProvider(): LLMProvider {
    return this.config.provider;
  }

  /**
   * Summarize a group of items
   *
   * @param request - Summarization request
   * @returns Summarization result
   */
  async summarize(request: SummarizationRequest): Promise<SummarizationResult> {
    const startTime = Date.now();

    // Validate request
    if (!request.items || request.items.length === 0) {
      throw createValidationError('items', 'cannot be empty for summarization');
    }

    // If provider is disabled, use fallback
    if (this.config.provider === 'disabled') {
      return this.generateFallbackSummary(request, startTime);
    }

    try {
      // Build prompts for this hierarchy level
      const variables: PromptVariables = {
        items: request.items,
        scopeContext: request.scopeContext,
        parentSummary: request.parentSummary,
        focusAreas: request.focusAreas,
        itemCount: request.items.length,
        levelName: HIERARCHY_LEVEL_NAMES[request.hierarchyLevel],
      };

      const { systemPrompt, userPrompt } = buildPrompts(request.hierarchyLevel, variables);

      // Validate context length
      const totalLength = systemPrompt.length + userPrompt.length;
      if (totalLength > MAX_CONTEXT_LENGTH) {
        throw createSizeLimitError('context', MAX_CONTEXT_LENGTH, totalLength, 'characters');
      }

      // Call appropriate provider
      let result: SummarizationResult;
      switch (this.config.provider) {
        case 'openai':
          result = await this.summarizeOpenAI(systemPrompt, userPrompt, request.hierarchyLevel);
          break;
        case 'anthropic':
          result = await this.summarizeAnthropic(
            systemPrompt,
            userPrompt,
            request.hierarchyLevel
          );
          break;
        case 'ollama':
          result = await this.summarizeOllama(systemPrompt, userPrompt, request.hierarchyLevel);
          break;
        default:
          throw createValidationError('provider', `unknown provider "${String(this.config.provider)}"`);
      }

      result.processingTimeMs = Date.now() - startTime;

      logger.debug(
        {
          level: request.hierarchyLevel,
          itemCount: request.items.length,
          provider: result.provider,
          processingTimeMs: result.processingTimeMs,
        },
        'Summarization completed'
      );

      return result;
    } catch (error) {
      logger.error(
        {
          provider: this.config.provider,
          level: request.hierarchyLevel,
          error: error instanceof Error ? error.message : String(error),
        },
        'Summarization failed, using fallback'
      );

      // Fallback to simple summary on error
      return this.generateFallbackSummary(request, startTime);
    }
  }

  /**
   * Batch summarize multiple requests
   *
   * @param requests - Array of summarization requests
   * @returns Batch result
   */
  async summarizeBatch(requests: SummarizationRequest[]): Promise<BatchSummarizationResult> {
    const startTime = Date.now();

    if (requests.length === 0) {
      return {
        results: [],
        totalProcessingTimeMs: 0,
        provider: this.config.provider,
        model: this.config.model,
      };
    }

    // For now, process sequentially (could be optimized with batching)
    const results: SummarizationResult[] = [];
    for (const request of requests) {
      const result = await this.summarize(request);
      results.push(result);
    }

    return {
      results,
      totalProcessingTimeMs: Date.now() - startTime,
      provider: this.config.provider,
      model: this.config.model,
    };
  }

  /**
   * Summarize using OpenAI
   */
  private async summarizeOpenAI(
    systemPrompt: string,
    userPrompt: string,
    level: HierarchyLevel
  ): Promise<SummarizationResult> {
    const client = this.openaiClient;
    if (!client) {
      throw createServiceUnavailableError('OpenAI', 'client not initialized');
    }

    return withRetry(
      async () => {
        const response = await client.chat.completions.create({
          model: this.config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
          // reasoning_effort for models with extended thinking
          ...(this.config.reasoningEffort ? { reasoning_effort: this.config.reasoningEffort } : {}),
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw createServiceUnavailableError('OpenAI', 'no content returned from API');
        }

        return this.parseResponse(content, level, 'openai');
      },
      {
        retryableErrors: isRetryableNetworkError,
        onRetry: (error, attempt) => {
          logger.warn({ error: error.message, attempt }, 'Retrying OpenAI summarization');
        },
      }
    );
  }

  /**
   * Summarize using Anthropic
   */
  private async summarizeAnthropic(
    systemPrompt: string,
    userPrompt: string,
    level: HierarchyLevel
  ): Promise<SummarizationResult> {
    const client = this.anthropicClient;
    if (!client) {
      throw createServiceUnavailableError('Anthropic', 'client not initialized');
    }

    return withRetry(
      async () => {
        const response = await client.messages.create({
          model: this.config.model,
          max_tokens: this.config.maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });

        const textBlock = response.content.find((block) => block.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
          throw createServiceUnavailableError('Anthropic', 'no text content returned from API');
        }

        return this.parseResponse(textBlock.text, level, 'anthropic');
      },
      {
        retryableErrors: isRetryableNetworkError,
        onRetry: (error, attempt) => {
          logger.warn({ error: error.message, attempt }, 'Retrying Anthropic summarization');
        },
      }
    );
  }

  /**
   * Summarize using Ollama
   */
  private async summarizeOllama(
    systemPrompt: string,
    userPrompt: string,
    level: HierarchyLevel
  ): Promise<SummarizationResult> {
    const url = `${this.config.ollamaBaseUrl}/api/generate`;

    return withRetry(
      async () => {
        const timeoutMs = 30000; // 30 second timeout
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: abortController.signal,
            body: JSON.stringify({
              model: this.config.model,
              prompt: `${systemPrompt}\n\n${userPrompt}`,
              format: 'json',
              stream: false,
              options: {
                temperature: this.config.temperature,
                num_predict: this.config.maxTokens,
              },
            }),
          });

          if (!response.ok) {
            throw createServiceUnavailableError('Ollama', `request failed: ${response.status} ${response.statusText}`);
          }

          const responseText = await readResponseWithLimit(
            response,
            MAX_RESPONSE_SIZE,
            abortController
          );

          const data = JSON.parse(responseText) as { response: string };
          if (!data.response) {
            throw createServiceUnavailableError('Ollama', 'no response returned from API');
          }

          return this.parseResponse(data.response, level, 'ollama');
        } finally {
          clearTimeout(timeoutId);
        }
      },
      {
        retryableErrors: (error: Error) => {
          return (
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('fetch failed') ||
            error.message.includes('network')
          );
        },
        onRetry: (error, attempt) => {
          logger.warn({ error: error.message, attempt }, 'Retrying Ollama summarization');
        },
      }
    );
  }

  /**
   * Parse LLM response into SummarizationResult
   */
  private parseResponse(
    content: string,
    level: HierarchyLevel,
    provider: LLMProvider
  ): SummarizationResult {
    // Try to extract JSON from response
    let jsonContent = content.trim();

    // Remove markdown code blocks if present
    const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[1]) {
      jsonContent = jsonMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(jsonContent) as {
        title?: string;
        content?: string;
        keyTerms?: string[];
        confidence?: number;
      };

      return {
        title: parsed.title || 'Summary',
        content: parsed.content || '',
        keyTerms: Array.isArray(parsed.keyTerms) ? parsed.keyTerms : [],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
        model: this.config.model,
        provider,
      };
    } catch (error) {
      logger.warn({ content: jsonContent.slice(0, 200) }, 'Failed to parse LLM response as JSON');

      // Return content as-is if JSON parsing fails
      return {
        title: `Level ${level} Summary`,
        content: jsonContent,
        keyTerms: [],
        confidence: 0.5,
        model: this.config.model,
        provider,
      };
    }
  }

  /**
   * Generate fallback summary without LLM
   */
  private generateFallbackSummary(
    request: SummarizationRequest,
    startTime: number
  ): SummarizationResult {
    const variables: PromptVariables = {
      items: request.items,
      scopeContext: request.scopeContext,
      parentSummary: request.parentSummary,
      focusAreas: request.focusAreas,
      itemCount: request.items.length,
      levelName: HIERARCHY_LEVEL_NAMES[request.hierarchyLevel],
    };

    const fallback = getFallbackSummary(variables.items, request.hierarchyLevel);

    return {
      ...fallback,
      confidence: 0.6, // Lower confidence for fallback
      model: 'fallback',
      provider: 'disabled',
      processingTimeMs: Date.now() - startTime,
    };
  }
}
