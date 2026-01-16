/**
 * Ollama provider for local LLM extraction
 */

import { createComponentLogger } from '../../../utils/logger.js';
import { withRetry } from '../../../utils/retry.js';
import { createValidationError } from '../../../core/errors.js';
import { config } from '../../../config/index.js';
import { EXTRACTION_SYSTEM_PROMPT, buildUserPrompt } from '../prompts.js';
import { parseExtractionResponse } from '../response-parser.js';
import {
  getOllamaTimeout,
  validateOllamaResponse,
  isOllamaRetryable,
  fetchOllamaWithTimeout,
} from '../ollama-utils.js';
import { validateExternalUrl, isValidModelName } from '../validation.js';
import type {
  IExtractionProvider,
  ExtractionInput,
  ExtractionResult,
  GenerationInput,
  GenerationResult,
  ExtractionProvider,
} from './types.js';

const logger = createComponentLogger('ollama-provider');

export class OllamaProvider implements IExtractionProvider {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl: string, model: string) {
    // Validate model name to prevent injection
    if (!isValidModelName(model)) {
      throw createValidationError(
        'ollamaModel',
        `invalid model name: "${model}". Must only contain alphanumeric characters, hyphens, underscores, colons, and dots`
      );
    }

    this.baseUrl = baseUrl;
    this.model = model;
  }

  getProvider(): ExtractionProvider {
    return 'ollama';
  }

  getModel(): string {
    return this.model;
  }

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    const url = `${this.baseUrl}/api/generate`;

    return withRetry(
      async () => {
        // Validate URL scheme (allow private IPs since Ollama is typically local)
        validateExternalUrl(url, true /* allowPrivate - Ollama is typically localhost */);

        const timeoutMs = getOllamaTimeout();

        const responseText = await fetchOllamaWithTimeout(
          url,
          {
            model: this.model,
            prompt: `${EXTRACTION_SYSTEM_PROMPT}\n\n${buildUserPrompt(input)}`,
            format: 'json',
            stream: false,
            options: {
              temperature: config.extraction.temperature,
              num_predict: config.extraction.maxTokens,
            },
          },
          timeoutMs
        );

        const responseContent = validateOllamaResponse(responseText);
        const parsed = parseExtractionResponse(responseContent);

        return {
          entries: parsed.entries,
          entities: parsed.entities,
          relationships: parsed.relationships,
          model: this.model,
          provider: 'ollama' as const,
          processingTimeMs: 0, // Will be set by caller
        };
      },
      {
        retryableErrors: isOllamaRetryable,
        onRetry: (error, attempt) => {
          logger.warn(
            {
              error: error.message,
              errorName: error.name,
              stack: error.stack,
              attempt,
              provider: 'ollama',
              model: this.model,
              baseUrl: this.baseUrl,
            },
            'Retrying Ollama extraction after error'
          );
        },
      }
    );
  }

  async generate(input: GenerationInput): Promise<GenerationResult> {
    const url = `${this.baseUrl}/api/generate`;

    const count = Math.min(Math.max(input.count ?? 1, 1), 5);
    const temperature = input.temperature ?? 0.7;
    const maxTokens = input.maxTokens ?? 512;

    return withRetry(
      async () => {
        const texts: string[] = [];

        // Generate sequentially (Ollama is typically single-threaded on local GPU)
        for (let i = 0; i < count; i++) {
          validateExternalUrl(url, true);

          const timeoutMs = getOllamaTimeout();

          const responseText = await fetchOllamaWithTimeout(
            url,
            {
              model: this.model,
              prompt: `${input.systemPrompt}\n\n${input.userPrompt}`,
              stream: false,
              options: {
                temperature,
                num_predict: maxTokens,
              },
            },
            timeoutMs
          );

          const responseContent = validateOllamaResponse(responseText);
          texts.push(responseContent);
        }

        return {
          texts,
          model: this.model,
          provider: 'ollama' as const,
          processingTimeMs: 0, // Will be set by caller
        };
      },
      {
        retryableErrors: isOllamaRetryable,
        onRetry: (error, attempt) => {
          logger.warn(
            {
              error: error.message,
              errorName: error.name,
              stack: error.stack,
              attempt,
              provider: 'ollama',
              model: this.model,
              baseUrl: this.baseUrl,
            },
            'Retrying Ollama generation after error'
          );
        },
      }
    );
  }
}
