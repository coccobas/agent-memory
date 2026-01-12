/**
 * LM Studio Integration
 *
 * Connect local LLMs to agent-memory through LM Studio
 *
 * @example
 * ```typescript
 * import { createMemoryAgent, createLMStudioClient } from 'agent-memory/lm-studio';
 *
 * // Simple client usage
 * const client = createLMStudioClient({ model: 'mistral-7b-instruct' });
 * const response = await client.chat([
 *   { role: 'user', content: 'Hello!' }
 * ]);
 *
 * // Memory-enhanced agent
 * const agent = createMemoryAgent({
 *   lmStudioConfig: { model: 'mistral-7b-instruct' },
 *   memoryRetriever: myMemoryRetriever
 * });
 *
 * const result = await agent.chat({
 *   messages: [{ role: 'user', content: 'What are the coding guidelines?' }],
 *   memoryQuery: 'coding guidelines'
 * });
 * ```
 */

// Client
export { LMStudioClient, createLMStudioClient } from './client.js';

// Memory-enhanced agent
export { MemoryAgent, createMemoryAgent } from './memory-agent.js';
export type { MemoryAgentOptions, MemoryRetriever } from './memory-agent.js';

// Types
export type {
  LMStudioConfig,
  LMStudioHealthCheck,
  LMStudioModel,
  MemoryContext,
  MemoryEnhancedChatOptions,
  MemoryEnhancedChatResponse,
} from './types.js';

export { DEFAULT_LM_STUDIO_CONFIG } from './types.js';
