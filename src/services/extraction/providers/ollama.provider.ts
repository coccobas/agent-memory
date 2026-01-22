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

    // SSRF protection: Validate Ollama URL at construction time
    this.validateOllamaUrl(baseUrl);

    this.baseUrl = baseUrl;
    this.model = model;
  }

  private validateOllamaUrl(baseUrl: string): void {
    const url = new URL(baseUrl);
    const hostname = url.hostname.toLowerCase();

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw createValidationError(
        'ollamaBaseUrl',
        `Invalid protocol: ${url.protocol}. Only http/https allowed`
      );
    }

    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    const isPrivateNetwork =
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname);

    const isProduction = ['production', 'prod', 'staging'].includes(
      (process.env.NODE_ENV || '').toLowerCase()
    );

    if (!isLocalhost && !isPrivateNetwork) {
      if (isProduction) {
        throw createValidationError(
          'ollamaBaseUrl',
          `SSRF protection: Ollama must be on localhost or private network in production. Got: ${hostname}`
        );
      }
      logger.warn(
        { hostname },
        'Ollama configured with external URL. This is a potential SSRF risk in production.'
      );
    }
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
