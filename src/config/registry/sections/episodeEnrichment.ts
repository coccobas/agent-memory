import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const episodeEnrichmentSection: ConfigSectionMeta = {
  name: 'episodeEnrichment',
  description: 'Episode name enrichment using local LLM on completion.',
  options: {
    provider: {
      envKey: 'AGENT_MEMORY_EPISODE_ENRICHMENT_PROVIDER',
      defaultValue: 'lmstudio',
      description: 'Provider: lmstudio (default), openai, ollama, or disabled.',
      schema: z.enum(['lmstudio', 'openai', 'ollama', 'disabled']),
    },
    lmStudioBaseUrl: {
      envKey: 'AGENT_MEMORY_EPISODE_ENRICHMENT_LM_STUDIO_BASE_URL',
      defaultValue: 'http://localhost:1234/v1',
      description: 'LM Studio API base URL.',
      schema: z.string(),
    },
    model: {
      envKey: 'AGENT_MEMORY_EPISODE_ENRICHMENT_MODEL',
      defaultValue: 'qwen/qwen3-1.7b',
      description: 'Model for name enrichment (small, fast model recommended).',
      schema: z.string(),
    },
    openaiApiKey: {
      envKey: 'AGENT_MEMORY_EPISODE_ENRICHMENT_OPENAI_API_KEY',
      defaultValue: undefined,
      description: 'OpenAI API key (if using openai provider).',
      schema: z.string().optional(),
      sensitive: true,
    },
    ollamaBaseUrl: {
      envKey: 'AGENT_MEMORY_EPISODE_ENRICHMENT_OLLAMA_BASE_URL',
      defaultValue: 'http://localhost:11434',
      description: 'Ollama API base URL.',
      schema: z.string(),
    },
    timeoutMs: {
      envKey: 'AGENT_MEMORY_EPISODE_ENRICHMENT_TIMEOUT_MS',
      defaultValue: 30000,
      description: 'Request timeout in milliseconds.',
      schema: z.number().int().min(1000).max(120000),
      parse: 'int',
    },
    maxTokens: {
      envKey: 'AGENT_MEMORY_EPISODE_ENRICHMENT_MAX_TOKENS',
      defaultValue: 100,
      description: 'Max tokens for LLM response.',
      schema: z.number().int().min(20).max(500),
      parse: 'int',
    },
    temperature: {
      envKey: 'AGENT_MEMORY_EPISODE_ENRICHMENT_TEMPERATURE',
      defaultValue: 0.3,
      description: 'LLM temperature (0-1).',
      schema: z.number().min(0).max(1),
      parse: 'number',
    },
  },
};
