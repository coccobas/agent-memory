/**
 * Query Rewriting Configuration Section
 *
 * Settings for HyDE (Hypothetical Document Embedding) and query expansion.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const queryRewriteSection: ConfigSectionMeta = {
  name: 'queryRewrite',
  description: 'Query rewriting, HyDE, and expansion configuration.',
  options: {
    enabled: {
      envKey: 'AGENT_MEMORY_QUERY_REWRITE_ENABLED',
      defaultValue: true,
      description: 'Enable query rewriting features.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    hydeEnabled: {
      envKey: 'AGENT_MEMORY_HYDE_ENABLED',
      defaultValue: true,
      description: 'Enable HyDE (Hypothetical Document Embedding).',
      schema: z.boolean(),
      parse: 'boolean',
    },
    hydeDocumentCount: {
      envKey: 'AGENT_MEMORY_HYDE_DOCUMENT_COUNT',
      defaultValue: 1,
      description: 'Number of hypothetical documents to generate per query.',
      schema: z.number().int().min(1).max(5),
      parse: 'int',
    },
    hydeTemperature: {
      envKey: 'AGENT_MEMORY_HYDE_TEMPERATURE',
      defaultValue: 0.7,
      description: 'Temperature for HyDE document generation (0-2).',
      schema: z.number().min(0).max(2),
      parse: 'number',
    },
    hydeMaxTokens: {
      envKey: 'AGENT_MEMORY_HYDE_MAX_TOKENS',
      defaultValue: 256,
      description: 'Maximum tokens per hypothetical document.',
      schema: z.number().int().min(50).max(1000),
      parse: 'int',
    },
    expansionEnabled: {
      envKey: 'AGENT_MEMORY_QUERY_EXPANSION_ENABLED',
      defaultValue: true,
      description: 'Enable query expansion with synonyms and relations.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    expansionUseDictionary: {
      envKey: 'AGENT_MEMORY_EXPANSION_USE_DICTIONARY',
      defaultValue: true,
      description: 'Use built-in synonym dictionary for expansion.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    expansionUseRelations: {
      envKey: 'AGENT_MEMORY_EXPANSION_USE_RELATIONS',
      defaultValue: true,
      description: 'Use relation graph for query expansion.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    expansionUseLLM: {
      envKey: 'AGENT_MEMORY_EXPANSION_USE_LLM',
      defaultValue: false,
      description: 'Use LLM for semantic query expansion (slower, more accurate).',
      schema: z.boolean(),
      parse: 'boolean',
    },
    maxExpansions: {
      envKey: 'AGENT_MEMORY_MAX_QUERY_EXPANSIONS',
      defaultValue: 3,
      description: 'Maximum number of query expansions to generate.',
      schema: z.number().int().min(1).max(10),
      parse: 'int',
    },
    expansionWeight: {
      envKey: 'AGENT_MEMORY_EXPANSION_WEIGHT',
      defaultValue: 0.5,
      description: 'Weight for expanded queries relative to original (0-1).',
      schema: z.number().min(0).max(1),
      parse: 'number',
    },
    decompositionEnabled: {
      envKey: 'AGENT_MEMORY_QUERY_DECOMPOSITION_ENABLED',
      defaultValue: false,
      description: 'Enable multi-hop query decomposition.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    decompositionThreshold: {
      envKey: 'AGENT_MEMORY_DECOMPOSITION_THRESHOLD',
      defaultValue: 0.7,
      description: 'Confidence threshold for pattern-based decomposition detection (0-1).',
      schema: z.number().min(0).max(1),
      parse: 'number',
    },
    decompositionMaxSubQueries: {
      envKey: 'AGENT_MEMORY_DECOMPOSITION_MAX_SUB_QUERIES',
      defaultValue: 5,
      description: 'Maximum number of sub-queries to generate from decomposition.',
      schema: z.number().int().min(1).max(10),
      parse: 'int',
    },
    decompositionUseLLM: {
      envKey: 'AGENT_MEMORY_DECOMPOSITION_USE_LLM',
      defaultValue: false,
      description: 'Use LLM for complex query decomposition (slower, more accurate).',
      schema: z.boolean(),
      parse: 'boolean',
    },
    intentClassificationMode: {
      envKey: 'AGENT_MEMORY_INTENT_CLASSIFICATION_MODE',
      defaultValue: 'pattern',
      description: 'Intent classification mode: pattern (fast), llm (accurate), or hybrid.',
      schema: z.enum(['pattern', 'llm', 'hybrid']),
    },
    provider: {
      envKey: 'AGENT_MEMORY_QUERY_REWRITE_PROVIDER',
      defaultValue: 'openai',
      description: 'LLM provider for HyDE and LLM-based expansion (defaults to LM Studio via OpenAI-compatible API).',
      schema: z.enum(['openai', 'anthropic', 'ollama', 'disabled']),
    },
    model: {
      envKey: 'AGENT_MEMORY_QUERY_REWRITE_MODEL',
      defaultValue: 'oss-120b',
      description: 'Model for query rewriting (defaults to OSS 120B via LM Studio).',
      schema: z.string().optional(),
    },
  },
};
