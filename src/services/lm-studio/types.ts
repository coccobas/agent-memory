/**
 * LM Studio Integration Types
 *
 * Types for connecting local LLMs via LM Studio to agent-memory
 */

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

/**
 * LM Studio server configuration
 */
export interface LMStudioConfig {
  /** Base URL for LM Studio server (default: http://localhost:1234/v1) */
  baseUrl: string;
  /** Model identifier to use (from LM Studio) */
  model: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Default temperature for completions */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Enable streaming responses */
  stream?: boolean;
  /** Reasoning effort for models with extended thinking */
  reasoningEffort?: 'low' | 'medium' | 'high';
}

/**
 * Default configuration values (reads from environment variables)
 */
export const DEFAULT_LM_STUDIO_CONFIG: LMStudioConfig = {
  baseUrl: process.env.AGENT_MEMORY_LM_STUDIO_BASE_URL ?? 'http://localhost:1234/v1',
  model: process.env.AGENT_MEMORY_LM_STUDIO_MODEL ?? 'local-model',
  timeout: 60000,
  temperature: 0.7,
  maxTokens: 2048,
  stream: false,
};

/**
 * Memory context to inject into conversations
 */
export interface MemoryContext {
  /** Relevant guidelines for the current context */
  guidelines: Array<{
    id: string;
    name: string;
    content: string;
    priority?: number;
  }>;
  /** Relevant knowledge entries */
  knowledge: Array<{
    id: string;
    title: string;
    content: string;
    category?: string;
  }>;
  /** Available tools/patterns */
  tools: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  /** Summary of recent conversation context */
  conversationSummary?: string;
}

/**
 * Options for memory-enhanced chat completion
 */
export interface MemoryEnhancedChatOptions {
  /** Messages for the conversation */
  messages: ChatCompletionMessageParam[];
  /** Project ID for scoping memory queries */
  projectId?: string;
  /** Session ID for conversation context */
  sessionId?: string;
  /** Override temperature */
  temperature?: number;
  /** Override max tokens */
  maxTokens?: number;
  /** Whether to stream the response */
  stream?: boolean;
  /** Custom system prompt (memory context will be prepended) */
  systemPrompt?: string;
  /** Limit on memory entries to include */
  memoryLimit?: number;
  /** Search query for semantic memory retrieval */
  memoryQuery?: string;
}

/**
 * Response from memory-enhanced chat
 */
export interface MemoryEnhancedChatResponse {
  /** Generated content */
  content: string;
  /** Model used for generation */
  model: string;
  /** Token usage statistics */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Memory context that was injected */
  memoryContext?: MemoryContext;
  /** Finish reason */
  finishReason?: string;
}

/**
 * Model info from LM Studio
 */
export interface LMStudioModel {
  id: string;
  object: string;
  owned_by: string;
}

/**
 * Health check response
 */
export interface LMStudioHealthCheck {
  connected: boolean;
  baseUrl: string;
  availableModels: LMStudioModel[];
  currentModel?: string;
  error?: string;
}
