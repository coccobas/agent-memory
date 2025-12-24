/**
 * LoRA Export Configuration Section
 *
 * Settings for exporting guidelines as LoRA (Low-Rank Adaptation) training data.
 * Supports fine-tuning language models with project-specific guidelines.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const loraSection: ConfigSectionMeta = {
  name: 'lora',
  description: 'LoRA export configuration for fine-tuning language models.',
  options: {
    // Master control
    enabled: {
      envKey: 'AGENT_MEMORY_LORA_ENABLED',
      defaultValue: true,
      description: 'Enable LoRA export features.',
      schema: z.boolean(),
      parse: 'boolean',
    },

    // Export format
    defaultFormat: {
      envKey: 'AGENT_MEMORY_LORA_DEFAULT_FORMAT',
      defaultValue: 'alpaca',
      description:
        'Default export format: alpaca, sharegpt, openai-messages, or anthropic-prompts.',
      schema: z.enum(['alpaca', 'sharegpt', 'openai-messages', 'anthropic-prompts']),
    },

    // Training data generation
    examplesPerGuideline: {
      envKey: 'AGENT_MEMORY_LORA_EXAMPLES_PER_GUIDELINE',
      defaultValue: 3,
      description: 'Number of training examples to generate per guideline.',
      schema: z.number().int().min(1).max(20),
      parse: 'int',
    },

    includeNegative: {
      envKey: 'AGENT_MEMORY_LORA_INCLUDE_NEGATIVE',
      defaultValue: false,
      description: 'Include contrastive (negative) examples for better learning.',
      schema: z.boolean(),
      parse: 'boolean',
    },

    // Output configuration
    outputPath: {
      envKey: 'AGENT_MEMORY_LORA_OUTPUT_PATH',
      defaultValue: './lora-export',
      description: 'Default output directory for LoRA exports.',
      schema: z.string(),
      parse: 'path',
    },

    // Dataset splitting
    splitRatio: {
      envKey: 'AGENT_MEMORY_LORA_SPLIT_RATIO',
      defaultValue: 0.1,
      description: 'Train/eval split ratio (0.1 = 90% train, 10% eval).',
      schema: z.number().min(0.05).max(0.5),
      parse: 'number',
    },

    // LoRA adapter hyperparameters
    rank: {
      envKey: 'AGENT_MEMORY_LORA_RANK',
      defaultValue: 16,
      description: 'LoRA rank (r). Common values: 8, 16, 32, 64.',
      schema: z.number().int().min(1).max(128),
      parse: 'int',
    },

    alpha: {
      envKey: 'AGENT_MEMORY_LORA_ALPHA',
      defaultValue: 32,
      description: 'LoRA alpha (typically 2x rank). Controls adaptation strength.',
      schema: z.number().int().min(1).max(256),
      parse: 'int',
    },

    dropout: {
      envKey: 'AGENT_MEMORY_LORA_DROPOUT',
      defaultValue: 0.05,
      description: 'LoRA dropout rate (0.0-1.0). Prevents overfitting.',
      schema: z.number().min(0.0).max(1.0),
      parse: 'number',
    },

    // Target model configuration
    targetModel: {
      envKey: 'AGENT_MEMORY_LORA_TARGET_MODEL',
      defaultValue: 'llama',
      description:
        'Target model architecture for adapter config: llama, mistral, gpt2, bloom, t5, or default.',
      schema: z.enum(['llama', 'mistral', 'gpt2', 'bloom', 't5', 'default']),
    },

    // Script generation
    generateScript: {
      envKey: 'AGENT_MEMORY_LORA_GENERATE_SCRIPT',
      defaultValue: true,
      description: 'Generate training script stub with exports.',
      schema: z.boolean(),
      parse: 'boolean',
    },

    // Filtering
    minPriority: {
      envKey: 'AGENT_MEMORY_LORA_MIN_PRIORITY',
      defaultValue: 0,
      description: 'Minimum guideline priority to include (0-100).',
      schema: z.number().int().min(0).max(100),
      parse: 'int',
    },

    includeMetadata: {
      envKey: 'AGENT_MEMORY_LORA_INCLUDE_METADATA',
      defaultValue: true,
      description: 'Include guideline metadata in training examples.',
      schema: z.boolean(),
      parse: 'boolean',
    },
  },
};
