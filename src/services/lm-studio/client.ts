/**
 * LM Studio Client
 *
 * OpenAI-compatible client for connecting to local LLMs via LM Studio
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import {
  DEFAULT_LM_STUDIO_CONFIG,
  type LMStudioConfig,
  type LMStudioHealthCheck,
  type LMStudioModel,
} from './types.js';

/**
 * Client for interacting with LM Studio's local API server
 *
 * @example
 * ```typescript
 * const client = new LMStudioClient({
 *   baseUrl: 'http://localhost:1234/v1',
 *   model: 'mistral-7b-instruct'
 * });
 *
 * const response = await client.chat([
 *   { role: 'user', content: 'Hello!' }
 * ]);
 * ```
 */
export class LMStudioClient {
  private openai: OpenAI;
  private config: LMStudioConfig;

  constructor(config: Partial<LMStudioConfig> = {}) {
    this.config = { ...DEFAULT_LM_STUDIO_CONFIG, ...config };

    this.openai = new OpenAI({
      baseURL: this.config.baseUrl,
      apiKey: 'not-needed', // LM Studio doesn't require an API key
      timeout: this.config.timeout,
    });
  }

  /**
   * Get the current configuration
   */
  getConfig(): LMStudioConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LMStudioConfig>): void {
    this.config = { ...this.config, ...config };

    // Recreate client if baseUrl changed
    if (config.baseUrl) {
      this.openai = new OpenAI({
        baseURL: this.config.baseUrl,
        apiKey: 'not-needed',
        timeout: this.config.timeout,
      });
    }
  }

  /**
   * Check connection to LM Studio and get available models
   */
  async healthCheck(): Promise<LMStudioHealthCheck> {
    try {
      const models = await this.openai.models.list();
      const availableModels: LMStudioModel[] = [];

      for await (const model of models) {
        availableModels.push({
          id: model.id,
          object: model.object,
          owned_by: model.owned_by,
        });
      }

      return {
        connected: true,
        baseUrl: this.config.baseUrl,
        availableModels,
        currentModel: this.config.model,
      };
    } catch (error) {
      return {
        connected: false,
        baseUrl: this.config.baseUrl,
        availableModels: [],
        currentModel: this.config.model,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * List available models from LM Studio
   */
  async listModels(): Promise<LMStudioModel[]> {
    const models = await this.openai.models.list();
    const result: LMStudioModel[] = [];

    for await (const model of models) {
      result.push({
        id: model.id,
        object: model.object,
        owned_by: model.owned_by,
      });
    }

    return result;
  }

  /**
   * Send a chat completion request
   */
  async chat(
    messages: ChatCompletionMessageParam[],
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      stream?: false;
    } = {}
  ): Promise<{
    content: string;
    model: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    finishReason?: string;
  }> {
    const response = await this.openai.chat.completions.create({
      model: options.model ?? this.config.model,
      messages,
      temperature: options.temperature ?? this.config.temperature,
      max_tokens: options.maxTokens ?? this.config.maxTokens,
      stream: false,
      // reasoning_effort for models with extended thinking
      ...(this.config.reasoningEffort ? { reasoning_effort: this.config.reasoningEffort } : {}),
    });

    const choice = response.choices[0];

    return {
      content: choice?.message?.content ?? '',
      model: response.model,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
      finishReason: choice?.finish_reason ?? undefined,
    };
  }

  /**
   * Send a streaming chat completion request
   */
  async *chatStream(
    messages: ChatCompletionMessageParam[],
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): AsyncGenerator<string, void, unknown> {
    const stream = await this.openai.chat.completions.create({
      model: options.model ?? this.config.model,
      messages,
      temperature: options.temperature ?? this.config.temperature,
      max_tokens: options.maxTokens ?? this.config.maxTokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }

  /**
   * Generate embeddings (if supported by the loaded model)
   */
  async embed(
    input: string | string[],
    model?: string
  ): Promise<{
    embeddings: number[][];
    model: string;
    usage?: { promptTokens: number; totalTokens: number };
  }> {
    const response = await this.openai.embeddings.create({
      model: model ?? this.config.model,
      input,
    });

    return {
      embeddings: response.data.map((d) => d.embedding),
      model: response.model,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }

  /**
   * Get the underlying OpenAI client for advanced usage
   */
  getOpenAIClient(): OpenAI {
    return this.openai;
  }
}

/**
 * Create a pre-configured LM Studio client
 */
export function createLMStudioClient(
  config: Partial<LMStudioConfig> = {}
): LMStudioClient {
  return new LMStudioClient(config);
}
