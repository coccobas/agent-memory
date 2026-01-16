/**
 * Anthropic provider for extraction
 */

import Anthropic from '@anthropic-ai/sdk';
import { createComponentLogger } from '../../../utils/logger.js';
import { withRetry, isRetryableNetworkError } from '../../../utils/retry.js';
import { createExtractionError } from '../../../core/errors.js';
import { config } from '../../../config/index.js';
import { EXTRACTION_SYSTEM_PROMPT, buildUserPrompt } from '../prompts.js';
import { parseExtractionResponse } from '../response-parser.js';
import type {
  IExtractionProvider,
  ExtractionInput,
  ExtractionResult,
  GenerationInput,
  GenerationResult,
  ExtractionProvider,
} from './types.js';

const logger = createComponentLogger('anthropic-provider');

export class AnthropicProvider implements IExtractionProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({
      apiKey,
      timeout: 120000, // 120 second timeout
      maxRetries: 0, // Disable SDK retry
    });
    this.model = model;
  }

  getProvider(): ExtractionProvider {
    return 'anthropic';
  }

  getModel(): string {
    return this.model;
  }

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    return withRetry(
      async () => {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: config.extraction.maxTokens,
          system: EXTRACTION_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildUserPrompt(input) }],
        });

        // Extract text content from response
        const textBlock = response.content.find((block) => block.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
          throw createExtractionError('anthropic', 'no text content returned');
        }

        const parsed = parseExtractionResponse(textBlock.text);

        return {
          entries: parsed.entries,
          entities: parsed.entities,
          relationships: parsed.relationships,
          model: this.model,
          provider: 'anthropic' as const,
          tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
          processingTimeMs: 0, // Will be set by caller
        };
      },
      {
        retryableErrors: isRetryableNetworkError,
        onRetry: (error, attempt) => {
          logger.warn(
            {
              error: error.message,
              errorName: error.name,
              stack: error.stack,
              attempt,
              provider: 'anthropic',
              model: this.model,
            },
            'Retrying Anthropic extraction after error'
          );
        },
      }
    );
  }

  async generate(input: GenerationInput): Promise<GenerationResult> {
    const count = Math.min(Math.max(input.count ?? 1, 1), 5);
    const temperature = input.temperature ?? 0.7;
    const maxTokens = input.maxTokens ?? 512;

    return withRetry(
      async () => {
        // Generate multiple variations in parallel for efficiency
        const promises = Array.from({ length: count }, async () => {
          const response = await this.client.messages.create({
            model: this.model,
            max_tokens: maxTokens,
            temperature,
            system: input.systemPrompt,
            messages: [{ role: 'user', content: input.userPrompt }],
          });

          // Extract text content from response
          const textBlock = response.content.find((block) => block.type === 'text');
          if (!textBlock || textBlock.type !== 'text') {
            throw createExtractionError('anthropic', 'no text content returned');
          }

          return {
            text: textBlock.text,
            tokens: response.usage.input_tokens + response.usage.output_tokens,
          };
        });

        const results = await Promise.all(promises);
        const totalTokens = results.reduce((sum, r) => sum + r.tokens, 0);

        return {
          texts: results.map((r) => r.text),
          model: this.model,
          provider: 'anthropic' as const,
          tokensUsed: totalTokens,
          processingTimeMs: 0, // Will be set by caller
        };
      },
      {
        retryableErrors: isRetryableNetworkError,
        onRetry: (error, attempt) => {
          logger.warn(
            {
              error: error.message,
              errorName: error.name,
              stack: error.stack,
              attempt,
              provider: 'anthropic',
              model: this.model,
            },
            'Retrying Anthropic generation after error'
          );
        },
      }
    );
  }
}
