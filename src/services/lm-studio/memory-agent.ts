/**
 * Memory-Enhanced LM Studio Agent
 *
 * Combines local LLM inference via LM Studio with agent-memory
 * for context-aware, memory-enhanced conversations
 */

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { LMStudioClient } from './client.js';
import type {
  LMStudioConfig,
  MemoryContext,
  MemoryEnhancedChatOptions,
  MemoryEnhancedChatResponse,
} from './types.js';

/**
 * Options for creating a MemoryAgent
 */
export interface MemoryAgentOptions {
  /** LM Studio configuration */
  lmStudioConfig?: Partial<LMStudioConfig>;
  /** Agent identifier for memory operations */
  agentId?: string;
  /** Default project scope for memory queries */
  defaultProjectId?: string;
  /** Default session for conversation context */
  defaultSessionId?: string;
  /** Maximum memory entries to include in context */
  maxMemoryEntries?: number;
  /** Memory retrieval function (injected for flexibility) */
  memoryRetriever?: MemoryRetriever;
}

/**
 * Function signature for retrieving memory context
 */
export type MemoryRetriever = (params: {
  projectId?: string;
  sessionId?: string;
  query?: string;
  limit?: number;
}) => Promise<MemoryContext>;

/**
 * Memory-enhanced agent that uses local LLMs with agent-memory
 *
 * @example
 * ```typescript
 * const agent = new MemoryAgent({
 *   lmStudioConfig: { model: 'mistral-7b-instruct' },
 *   agentId: 'my-agent',
 *   memoryRetriever: async (params) => {
 *     // Use agent-memory MCP tools or direct API
 *     const context = await memoryQuery({ action: 'context', ...params });
 *     return context;
 *   }
 * });
 *
 * const response = await agent.chat({
 *   messages: [{ role: 'user', content: 'What are our coding guidelines?' }],
 *   memoryQuery: 'coding guidelines'
 * });
 * ```
 */
export class MemoryAgent {
  private client: LMStudioClient;
  private _agentId: string;
  private defaultProjectId?: string;
  private defaultSessionId?: string;
  private maxMemoryEntries: number;
  private memoryRetriever?: MemoryRetriever;

  constructor(options: MemoryAgentOptions = {}) {
    this.client = new LMStudioClient(options.lmStudioConfig);
    this._agentId = options.agentId ?? 'lm-studio-agent';
    this.defaultProjectId = options.defaultProjectId;
    this.defaultSessionId = options.defaultSessionId;
    this.maxMemoryEntries = options.maxMemoryEntries ?? 10;
    this.memoryRetriever = options.memoryRetriever;
  }

  /**
   * Get the agent identifier
   */
  get agentId(): string {
    return this._agentId;
  }

  /**
   * Set the memory retriever function
   */
  setMemoryRetriever(retriever: MemoryRetriever): void {
    this.memoryRetriever = retriever;
  }

  /**
   * Get the underlying LM Studio client
   */
  getLMStudioClient(): LMStudioClient {
    return this.client;
  }

  /**
   * Build a system prompt with memory context
   */
  private buildSystemPromptWithMemory(
    basePrompt: string | undefined,
    memoryContext: MemoryContext
  ): string {
    const sections: string[] = [];

    // Add base system prompt if provided
    if (basePrompt) {
      sections.push(basePrompt);
    }

    // Add guidelines
    if (memoryContext.guidelines.length > 0) {
      sections.push('## Guidelines to Follow');
      for (const guideline of memoryContext.guidelines) {
        const priority = guideline.priority ? ` (Priority: ${guideline.priority})` : '';
        sections.push(`### ${guideline.name}${priority}`);
        sections.push(guideline.content);
      }
    }

    // Add relevant knowledge
    if (memoryContext.knowledge.length > 0) {
      sections.push('## Relevant Knowledge');
      for (const entry of memoryContext.knowledge) {
        const category = entry.category ? ` [${entry.category}]` : '';
        sections.push(`### ${entry.title}${category}`);
        sections.push(entry.content);
      }
    }

    // Add available tools/patterns
    if (memoryContext.tools.length > 0) {
      sections.push('## Available Tools & Patterns');
      for (const tool of memoryContext.tools) {
        sections.push(`- **${tool.name}**: ${tool.description}`);
      }
    }

    // Add conversation summary
    if (memoryContext.conversationSummary) {
      sections.push('## Recent Context');
      sections.push(memoryContext.conversationSummary);
    }

    return sections.join('\n\n');
  }

  /**
   * Retrieve memory context for the conversation
   */
  private async retrieveMemoryContext(params: {
    projectId?: string;
    sessionId?: string;
    query?: string;
    limit?: number;
  }): Promise<MemoryContext | undefined> {
    if (!this.memoryRetriever) {
      return undefined;
    }

    try {
      return await this.memoryRetriever({
        projectId: params.projectId ?? this.defaultProjectId,
        sessionId: params.sessionId ?? this.defaultSessionId,
        query: params.query,
        limit: params.limit ?? this.maxMemoryEntries,
      });
    } catch (error) {
      console.warn('Failed to retrieve memory context:', error);
      return undefined;
    }
  }

  /**
   * Send a memory-enhanced chat completion
   */
  async chat(options: MemoryEnhancedChatOptions): Promise<MemoryEnhancedChatResponse> {
    // Retrieve memory context
    const memoryContext = await this.retrieveMemoryContext({
      projectId: options.projectId,
      sessionId: options.sessionId,
      query: options.memoryQuery ?? this.extractQueryFromMessages(options.messages),
      limit: options.memoryLimit,
    });

    // Build messages with memory-enhanced system prompt
    const messages: ChatCompletionMessageParam[] = [];

    // Add system message with memory context
    const systemPrompt = this.buildSystemPromptWithMemory(
      options.systemPrompt,
      memoryContext ?? { guidelines: [], knowledge: [], tools: [] }
    );

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // Add conversation messages (skip any existing system messages)
    for (const msg of options.messages) {
      if (msg.role !== 'system') {
        messages.push(msg);
      }
    }

    // Send to LM Studio
    const response = await this.client.chat(messages, {
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    });

    return {
      content: response.content,
      model: response.model,
      usage: response.usage,
      memoryContext,
      finishReason: response.finishReason,
    };
  }

  /**
   * Send a streaming memory-enhanced chat completion
   */
  async *chatStream(
    options: MemoryEnhancedChatOptions
  ): AsyncGenerator<{ chunk: string; done: boolean }, MemoryEnhancedChatResponse, unknown> {
    // Retrieve memory context
    const memoryContext = await this.retrieveMemoryContext({
      projectId: options.projectId,
      sessionId: options.sessionId,
      query: options.memoryQuery ?? this.extractQueryFromMessages(options.messages),
      limit: options.memoryLimit,
    });

    // Build messages with memory-enhanced system prompt
    const messages: ChatCompletionMessageParam[] = [];

    const systemPrompt = this.buildSystemPromptWithMemory(
      options.systemPrompt,
      memoryContext ?? { guidelines: [], knowledge: [], tools: [] }
    );

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of options.messages) {
      if (msg.role !== 'system') {
        messages.push(msg);
      }
    }

    // Stream response
    let fullContent = '';
    for await (const chunk of this.client.chatStream(messages, {
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    })) {
      fullContent += chunk;
      yield { chunk, done: false };
    }

    yield { chunk: '', done: true };

    return {
      content: fullContent,
      model: this.client.getConfig().model,
      memoryContext,
    };
  }

  /**
   * Extract a search query from conversation messages
   */
  private extractQueryFromMessages(messages: ChatCompletionMessageParam[]): string {
    // Get the last user message as the query
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg && msg.role === 'user' && typeof msg.content === 'string') {
        return msg.content;
      }
    }
    return '';
  }

  /**
   * Simple one-shot completion with memory context
   */
  async complete(
    prompt: string,
    options: Omit<MemoryEnhancedChatOptions, 'messages'> = {}
  ): Promise<string> {
    const response = await this.chat({
      ...options,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content;
  }
}

/**
 * Create a memory-enhanced LM Studio agent
 */
export function createMemoryAgent(options: MemoryAgentOptions = {}): MemoryAgent {
  return new MemoryAgent(options);
}
