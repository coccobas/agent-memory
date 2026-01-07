/**
 * memory_lora tool descriptor
 *
 * Export guidelines as LoRA training data for model fine-tuning.
 * Supports multiple formats (HuggingFace, OpenAI, Anthropic, Alpaca).
 */

import type { ToolDescriptor } from './types.js';
import { loraHandlers } from '../handlers/lora.handler.js';

export const memoryLoraDescriptor: ToolDescriptor = {
  name: 'memory_lora',
  visibility: 'advanced',
  description: `Export guidelines as LoRA training data for model fine-tuning.

Actions: export, list_adapters, generate_script

Generate training datasets from stored guidelines for creating LoRA adapters.
Supports multiple output formats and customizable example generation.

Examples:
{"action":"export","targetModel":"meta-llama/Llama-3-8B","format":"huggingface","outputPath":"./datasets","includeExamples":true,"agentId":"agent","admin_key":"key"}
{"action":"list_adapters","outputPath":"./datasets"}
{"action":"generate_script","targetModel":"gpt-3.5-turbo","format":"openai","datasetPath":"./datasets"}`,

  commonParams: {
    agentId: {
      type: 'string',
      description: 'Agent identifier for access control (required for export)',
    },
    admin_key: {
      type: 'string',
      description: 'Admin key (required for export and script generation with outputPath)',
    },
    targetModel: {
      type: 'string',
      description: 'Target model name (e.g., "meta-llama/Llama-3-8B", "gpt-3.5-turbo")',
    },
    format: {
      type: 'string',
      enum: ['huggingface', 'openai', 'anthropic', 'alpaca'],
      description: 'Export format (default: huggingface)',
    },
    outputPath: {
      type: 'string',
      description: 'Output directory path for datasets/scripts',
    },
    includeExamples: {
      type: 'boolean',
      description: 'Generate examples from guideline examples field (default: true)',
    },
    examplesPerGuideline: {
      type: 'number',
      description: 'Number of examples to generate per guideline (default: 3)',
    },
    trainEvalSplit: {
      type: 'number',
      description: 'Train/eval split ratio (0-1, default: 0.9)',
    },
    guidelineFilter: {
      type: 'object',
      description: 'Filter guidelines for export (category, priority, tags, scopeType, scopeId)',
      properties: {
        category: {
          type: 'string',
          description: 'Filter by guideline category',
        },
        priority: {
          type: 'number',
          description: 'Filter by exact priority value',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags (include guidelines with any of these tags)',
        },
        scopeType: {
          type: 'string',
          enum: ['global', 'org', 'project', 'session'],
          description: 'Filter by scope type',
        },
        scopeId: {
          type: 'string',
          description: 'Filter by scope ID',
        },
      },
    },
    datasetPath: {
      type: 'string',
      description: 'Path to dataset directory (for generate_script)',
    },
  },

  actions: {
    export: {
      params: {
        targetModel: {
          type: 'string',
          description: 'Target model name (required)',
        },
        outputPath: {
          type: 'string',
          description: 'Output directory path (required)',
        },
      },
      required: ['targetModel', 'outputPath', 'agentId', 'admin_key'],
      contextHandler: loraHandlers.export,
    },

    list_adapters: {
      params: {
        outputPath: {
          type: 'string',
          description: 'Directory to search for adapter configs (optional)',
        },
      },
      contextHandler: loraHandlers.list_adapters,
    },

    generate_script: {
      params: {
        targetModel: {
          type: 'string',
          description: 'Target model name (required)',
        },
        datasetPath: {
          type: 'string',
          description: 'Path to dataset directory (required)',
        },
        outputPath: {
          type: 'string',
          description: 'Output path for script file (optional)',
        },
      },
      required: ['targetModel', 'datasetPath'],
      contextHandler: loraHandlers.generate_script,
    },
  },
};
