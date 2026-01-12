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
    mode: {
      envKey: 'AGENT_MEMORY_EXTRACTION_MODE',
      defaultValue: 'technical',
      description: 'Extraction mode: technical (code/dev context), personal (conversations/people), or auto (detect from content).',
      schema: z.enum(['technical', 'personal', 'auto']),
    },
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
    openaiJsonMode: {
      envKey: 'AGENT_MEMORY_EXTRACTION_OPENAI_JSON_MODE',
      defaultValue: true,
      description: 'Enable response_format: json_object. Disable for LM Studio compatibility.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    openaiReasoningEffort: {
      envKey: 'AGENT_MEMORY_EXTRACTION_REASONING_EFFORT',
      defaultValue: undefined,
      description: 'Reasoning effort for extraction: low, medium, high. For reasoning models like o1/o3 or local models with extended thinking.',
      schema: z.enum(['low', 'medium', 'high']).optional(),
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
    timeoutMs: {
      envKey: 'AGENT_MEMORY_EXTRACTION_TIMEOUT_MS',
      defaultValue: 30000,
      description: 'Timeout for extraction requests in milliseconds. Increase for slower local LLMs.',
      schema: z.number().int().min(5000).max(300000),
      parse: 'int',
    },
    confidenceThreshold: {
      envKey: 'AGENT_MEMORY_EXTRACTION_CONFIDENCE_THRESHOLD',
      defaultValue: 0.7,
      description: 'Default confidence threshold for auto-storing extracted entries.',
      schema: z.number().min(0).max(1),
      parse: 'number',
    },
    // Incremental extraction options
    incrementalEnabled: {
      envKey: 'AGENT_MEMORY_INCREMENTAL_ENABLED',
      defaultValue: true,
      description: 'Enable incremental extraction during conversations.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    incrementalWindowSize: {
      envKey: 'AGENT_MEMORY_INCREMENTAL_WINDOW_SIZE',
      defaultValue: 10,
      description: 'Maximum turns to include in an incremental extraction window.',
      schema: z.number().int().min(3).max(50),
      parse: 'int',
    },
    incrementalWindowOverlap: {
      envKey: 'AGENT_MEMORY_INCREMENTAL_WINDOW_OVERLAP',
      defaultValue: 3,
      description: 'Number of turns to overlap between extraction windows for context.',
      schema: z.number().int().min(0).max(10),
      parse: 'int',
    },
    incrementalMinTokens: {
      envKey: 'AGENT_MEMORY_INCREMENTAL_MIN_TOKENS',
      defaultValue: 500,
      description: 'Minimum tokens required to trigger incremental extraction.',
      schema: z.number().int().min(100),
      parse: 'int',
    },
    incrementalMaxTokens: {
      envKey: 'AGENT_MEMORY_INCREMENTAL_MAX_TOKENS',
      defaultValue: 4000,
      description: 'Maximum tokens per incremental extraction window.',
      schema: z.number().int().min(500),
      parse: 'int',
    },
    // Trigger detection options
    triggerDetectionEnabled: {
      envKey: 'AGENT_MEMORY_TRIGGER_DETECTION_ENABLED',
      defaultValue: true,
      description: 'Enable automatic trigger detection for extraction.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    triggerCooldownMs: {
      envKey: 'AGENT_MEMORY_TRIGGER_COOLDOWN_MS',
      defaultValue: 30000,
      description: 'Cooldown period between trigger-based extractions (ms).',
      schema: z.number().int().min(0),
      parse: 'int',
    },
    // Atomicity options - ensure extracted entries contain one concept each
    atomicityEnabled: {
      envKey: 'AGENT_MEMORY_EXTRACTION_ATOMICITY_ENABLED',
      defaultValue: true,
      description: 'Enable automatic atomicity validation and splitting of compound entries.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    atomicitySplitMode: {
      envKey: 'AGENT_MEMORY_EXTRACTION_ATOMICITY_SPLIT_MODE',
      defaultValue: 'silent',
      description: 'How to handle compound entry splitting: silent (auto-split), log (split with logging), disabled (detect only).',
      schema: z.enum(['silent', 'log', 'disabled']),
    },
    atomicityMaxSplits: {
      envKey: 'AGENT_MEMORY_EXTRACTION_ATOMICITY_MAX_SPLITS',
      defaultValue: 5,
      description: 'Maximum number of atomic entries to create from a single compound entry.',
      schema: z.number().int().min(2).max(10),
      parse: 'int',
    },
    atomicityContentThreshold: {
      envKey: 'AGENT_MEMORY_EXTRACTION_ATOMICITY_CONTENT_THRESHOLD',
      defaultValue: 300,
      description: 'Content length (chars) above which to apply stricter atomicity checks.',
      schema: z.number().int().min(100).max(1000),
      parse: 'int',
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
