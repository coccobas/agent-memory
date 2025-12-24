/**
 * Extraction Configuration Section
 *
 * LLM-based auto-capture settings (memory_observe tool).
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';
import { getExtractionProvider } from '../parsers.js';

export const extractionSection: ConfigSectionMeta = {
  name: 'extraction',
  description: 'LLM-based memory extraction configuration.',
  options: {
    provider: {
      envKey: 'AGENT_MEMORY_EXTRACTION_PROVIDER',
      defaultValue: 'disabled',
      description: 'Extraction provider: openai, anthropic, ollama, or disabled.',
      schema: z.enum(['openai', 'anthropic', 'ollama', 'disabled']),
      // Custom parser with auto-detection based on API keys
      parse: () => getExtractionProvider(),
    },
    openaiApiKey: {
      envKey: 'AGENT_MEMORY_OPENAI_API_KEY',
      defaultValue: undefined,
      description: 'OpenAI API key for extraction.',
      schema: z.string().optional(),
      sensitive: true,
    },
    openaiBaseUrl: {
      envKey: 'AGENT_MEMORY_EXTRACTION_OPENAI_BASE_URL',
      defaultValue: undefined,
      description: 'Custom OpenAI-compatible API base URL (for LM Studio, LocalAI, etc.).',
      schema: z.string().optional(),
    },
    strictBaseUrlAllowlist: {
      envKey: 'AGENT_MEMORY_EXTRACTION_STRICT_ALLOWLIST',
      defaultValue: false,
      description:
        'Enforce base URL allowlist (block non-allowed hosts). Set to true for production security.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    openaiModel: {
      envKey: 'AGENT_MEMORY_EXTRACTION_OPENAI_MODEL',
      defaultValue: 'gpt-4o-mini',
      description: 'OpenAI model to use for extraction.',
      schema: z.string(),
    },
    anthropicApiKey: {
      envKey: 'AGENT_MEMORY_ANTHROPIC_API_KEY',
      defaultValue: undefined,
      description: 'Anthropic API key for extraction.',
      schema: z.string().optional(),
      sensitive: true,
    },
    anthropicModel: {
      envKey: 'AGENT_MEMORY_EXTRACTION_ANTHROPIC_MODEL',
      defaultValue: 'claude-3-5-sonnet-20241022',
      description: 'Anthropic model to use for extraction.',
      schema: z.string(),
    },
    ollamaBaseUrl: {
      envKey: 'AGENT_MEMORY_OLLAMA_BASE_URL',
      defaultValue: 'http://localhost:11434',
      description: 'Ollama API base URL.',
      schema: z.string(),
    },
    ollamaModel: {
      envKey: 'AGENT_MEMORY_OLLAMA_MODEL',
      defaultValue: 'llama3.2',
      description: 'Ollama model to use for extraction.',
      schema: z.string(),
    },
    maxTokens: {
      envKey: 'AGENT_MEMORY_EXTRACTION_MAX_TOKENS',
      defaultValue: 4096,
      description: 'Maximum tokens for extraction responses.',
      schema: z.number().int().min(1),
      parse: 'int',
    },
    temperature: {
      envKey: 'AGENT_MEMORY_EXTRACTION_TEMPERATURE',
      defaultValue: 0.2,
      description: 'LLM temperature for extraction (0-1).',
      schema: z.number().min(0).max(2),
      parse: 'number',
    },
    confidenceThreshold: {
      envKey: 'AGENT_MEMORY_EXTRACTION_CONFIDENCE_THRESHOLD',
      defaultValue: 0.7,
      description: 'Default confidence threshold for auto-storing extracted entries.',
      schema: z.number().min(0).max(1),
      parse: 'number',
    },
  },
};

// Nested confidence thresholds - handled separately in registry index
export const extractionConfidenceThresholds = {
  guideline: {
    envKey: 'AGENT_MEMORY_EXTRACTION_CONFIDENCE_GUIDELINE',
    defaultValue: 0.75,
    description: 'Confidence threshold for extracting guidelines.',
    schema: z.number().min(0).max(1),
  },
  knowledge: {
    envKey: 'AGENT_MEMORY_EXTRACTION_CONFIDENCE_KNOWLEDGE',
    defaultValue: 0.7,
    description: 'Confidence threshold for extracting knowledge.',
    schema: z.number().min(0).max(1),
  },
  tool: {
    envKey: 'AGENT_MEMORY_EXTRACTION_CONFIDENCE_TOOL',
    defaultValue: 0.65,
    description: 'Confidence threshold for extracting tools.',
    schema: z.number().min(0).max(1),
  },
  entity: {
    envKey: 'AGENT_MEMORY_EXTRACTION_CONFIDENCE_ENTITY',
    defaultValue: 0.7,
    description: 'Confidence threshold for extracting entities.',
    schema: z.number().min(0).max(1),
  },
  relationship: {
    envKey: 'AGENT_MEMORY_EXTRACTION_CONFIDENCE_RELATIONSHIP',
    defaultValue: 0.75,
    description: 'Confidence threshold for extracting relationships.',
    schema: z.number().min(0).max(1),
  },
};
