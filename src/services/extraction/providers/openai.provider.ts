/**
 * OpenAI provider for extraction
 */

import { OpenAI } from 'openai';
import { createComponentLogger } from '../../../utils/logger.js';
import { withRetry, isRetryableNetworkError } from '../../../utils/retry.js';
import { createExtractionError } from '../../../core/errors.js';
import { config } from '../../../config/index.js';
import { EXTRACTION_SYSTEM_PROMPT, buildUserPrompt } from '../prompts.js';
import { parseExtractionResponse } from '../response-parser.js';
import { validateOpenAIBaseUrl } from '../validation.js';
import type {
  IExtractionProvider,
  ExtractionInput,
  ExtractionResult,
  GenerationInput,
  GenerationResult,
  ExtractionProvider,
} from './types.js';

const logger = createComponentLogger('openai-provider');

export class OpenAIProvider implements IExtractionProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string, baseUrl?: string, strictBaseUrlAllowlist: boolean = true) {
    // Validate custom base URL (use passed value, not global config singleton)
    validateOpenAIBaseUrl(baseUrl, strictBaseUrlAllowlist);

    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl || undefined,
      timeout: 600000, // 10 minute timeout for slow local LLMs
      maxRetries: 0, // Disable SDK retry - we handle retries with withRetry
    });
    this.model = model;
  }

  getProvider(): ExtractionProvider {
    return 'openai';
  }

  getModel(): string {
    return this.model;
  }

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    return withRetry(
      async () => {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(input) },
          ],
          // response_format disabled for LM Studio compatibility when openaiJsonMode=false
          ...(config.extraction.openaiJsonMode
            ? { response_format: { type: 'json_object' as const } }
            : {}),
          temperature: config.extraction.temperature,
          max_tokens: config.extraction.maxTokens,
          // reasoning_effort for o1/o3 models or LM Studio with extended thinking
          ...(config.extraction.openaiReasoningEffort
            ? { reasoning_effort: config.extraction.openaiReasoningEffort }
            : {}),
        });

        // Validate response
        if (!response.choices || response.choices.length === 0) {
          throw createExtractionError(
            'openai',
            'empty choices array - model may have refused to respond'
          );
        }
        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw createExtractionError('openai', 'no content in message');
        }

        const parsed = parseExtractionResponse(content);

        return {
          entries: parsed.entries,
          entities: parsed.entities,
          relationships: parsed.relationships,
          model: this.model,
          provider: 'openai' as const,
          tokensUsed: response.usage?.total_tokens,
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
              provider: 'openai',
              model: this.model,
            },
            'Retrying OpenAI extraction after error'
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
          const response = await this.client.chat.completions.create({
            model: this.model,
            messages: [
              { role: 'system', content: input.systemPrompt },
              { role: 'user', content: input.userPrompt },
            ],
            temperature,
            max_tokens: maxTokens,
          });

          if (!response.choices || response.choices.length === 0) {
            throw createExtractionError('openai', 'empty choices array');
          }
          const content = response.choices[0]?.message?.content;
          if (!content) {
            throw createExtractionError('openai', 'no content in message');
          }

          return {
            text: content,
            tokens: response.usage?.total_tokens ?? 0,
          };
        });

        const results = await Promise.all(promises);
        const totalTokens = results.reduce((sum, r) => sum + r.tokens, 0);

        return {
          texts: results.map((r) => r.text),
          model: this.model,
          provider: 'openai' as const,
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
              provider: 'openai',
              model: this.model,
            },
            'Retrying OpenAI generation after error'
          );
        },
      }
    );
  }
}
