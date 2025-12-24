/**
 * Reinforcement Learning Configuration Section
 *
 * Settings for the RL-based policy learning system that optimizes:
 * - Memory extraction decisions
 * - Retrieval strategies
 * - Consolidation policies
 * - Feedback collection and attribution
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const rlSection: ConfigSectionMeta = {
  name: 'rl',
  description: 'Reinforcement learning policy configuration.',
  options: {
    // Master control
    enabled: {
      envKey: 'AGENT_MEMORY_RL_ENABLED',
      defaultValue: true,
      description: 'Master kill switch for all RL features.',
      schema: z.boolean(),
      parse: 'boolean',
    },

    // Feedback collection
    feedbackEnabled: {
      envKey: 'AGENT_MEMORY_RL_FEEDBACK_ENABLED',
      defaultValue: true,
      description: 'Enable feedback data collection for RL training.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    feedbackOutcomeInference: {
      envKey: 'AGENT_MEMORY_RL_FEEDBACK_OUTCOME_INFERENCE',
      defaultValue: 'rule_based',
      description: 'Method for inferring outcomes from user behavior.',
      schema: z.enum(['rule_based', 'llm_based']),
    },
    feedbackAttributionMethod: {
      envKey: 'AGENT_MEMORY_RL_FEEDBACK_ATTRIBUTION',
      defaultValue: 'linear',
      description: 'Attribution method for assigning credit to memories.',
      schema: z.enum(['last_touch', 'linear', 'attention']),
    },
    feedbackRetentionDays: {
      envKey: 'AGENT_MEMORY_RL_FEEDBACK_RETENTION_DAYS',
      defaultValue: 90,
      description: 'Number of days to retain feedback data before cleanup.',
      schema: z.number().int().min(7),
      parse: 'int',
    },

    // Extraction policy
    extractionPolicyEnabled: {
      envKey: 'AGENT_MEMORY_RL_EXTRACTION_POLICY_ENABLED',
      defaultValue: true,
      description: 'Use learned extraction policy instead of confidence thresholds.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    extractionModelPath: {
      envKey: 'AGENT_MEMORY_RL_EXTRACTION_MODEL_PATH',
      defaultValue: '',
      description: 'Path to trained extraction policy model (empty = use defaults).',
      schema: z.string(),
    },

    // Retrieval policy
    retrievalPolicyEnabled: {
      envKey: 'AGENT_MEMORY_RL_RETRIEVAL_POLICY_ENABLED',
      defaultValue: true,
      description: 'Use learned retrieval policy instead of always retrieving.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    retrievalModelPath: {
      envKey: 'AGENT_MEMORY_RL_RETRIEVAL_MODEL_PATH',
      defaultValue: '',
      description: 'Path to trained retrieval policy model (empty = use defaults).',
      schema: z.string(),
    },

    // Consolidation policy
    consolidationPolicyEnabled: {
      envKey: 'AGENT_MEMORY_RL_CONSOLIDATION_POLICY_ENABLED',
      defaultValue: true,
      description: 'Use learned consolidation policy instead of quality gates.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    consolidationModelPath: {
      envKey: 'AGENT_MEMORY_RL_CONSOLIDATION_MODEL_PATH',
      defaultValue: '',
      description: 'Path to trained consolidation policy model (empty = use defaults).',
      schema: z.string(),
    },

    // Training settings
    trainingEnabled: {
      envKey: 'AGENT_MEMORY_RL_TRAINING_ENABLED',
      defaultValue: false,
      description: 'Enable RL policy training features.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    trainingSchedule: {
      envKey: 'AGENT_MEMORY_RL_TRAINING_SCHEDULE',
      defaultValue: '0 3 * * 0',
      description: 'Cron expression for automated training runs (weekly Sunday 3am).',
      schema: z.string(),
    },
    trainingMinExamples: {
      envKey: 'AGENT_MEMORY_RL_TRAINING_MIN_EXAMPLES',
      defaultValue: 1000,
      description: 'Minimum feedback examples required before training.',
      schema: z.number().int().min(100),
      parse: 'int',
    },
    trainingEpochs: {
      envKey: 'AGENT_MEMORY_RL_EPOCHS',
      defaultValue: 3,
      description: 'Number of training epochs for DPO training.',
      schema: z.number().int().min(1).max(20),
      parse: 'int',
    },
    trainingBatchSize: {
      envKey: 'AGENT_MEMORY_RL_BATCH_SIZE',
      defaultValue: 8,
      description: 'Batch size for training (adjust based on GPU memory).',
      schema: z.number().int().min(1).max(128),
      parse: 'int',
    },
    trainingLearningRate: {
      envKey: 'AGENT_MEMORY_RL_LEARNING_RATE',
      defaultValue: 5e-5,
      description: 'Learning rate for optimizer (typically 1e-5 to 1e-4).',
      schema: z.number().min(1e-6).max(1e-3),
      parse: 'number',
    },
    trainingBeta: {
      envKey: 'AGENT_MEMORY_RL_BETA',
      defaultValue: 0.1,
      description: 'DPO beta parameter for KL penalty (0.01-0.5).',
      schema: z.number().min(0.01).max(1.0),
      parse: 'number',
    },
    trainingEvalSplit: {
      envKey: 'AGENT_MEMORY_RL_EVAL_SPLIT',
      defaultValue: 0.2,
      description: 'Fraction of data to use for evaluation (0.05-0.5).',
      schema: z.number().min(0.05).max(0.5),
      parse: 'number',
    },
    trainingModelStoragePath: {
      envKey: 'AGENT_MEMORY_RL_MODEL_PATH',
      defaultValue: './models/rl',
      description: 'Directory path for storing trained RL models.',
      schema: z.string(),
      parse: 'path',
    },
    trainingExportFormat: {
      envKey: 'AGENT_MEMORY_RL_EXPORT_FORMAT',
      defaultValue: 'jsonl',
      description: 'Default export format for training datasets.',
      schema: z.enum(['huggingface', 'openai', 'csv', 'jsonl']),
    },
  },
};
