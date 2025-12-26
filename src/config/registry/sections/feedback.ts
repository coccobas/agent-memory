/**
 * Feedback Configuration Section
 *
 * Settings for the feedback queue processing system.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const feedbackSection: ConfigSectionMeta = {
  name: 'feedback',
  description: 'Feedback queue processing configuration.',
  options: {
    queueSize: {
      envKey: 'AGENT_MEMORY_FEEDBACK_QUEUE_SIZE',
      defaultValue: 500,
      description: 'Maximum number of batches in the feedback queue.',
      schema: z.number().int().min(1),
      parse: 'int',
    },
    workerConcurrency: {
      envKey: 'AGENT_MEMORY_FEEDBACK_WORKER_CONCURRENCY',
      defaultValue: 2,
      description: 'Number of concurrent workers processing feedback batches.',
      schema: z.number().int().min(1),
      parse: 'int',
    },
    batchTimeoutMs: {
      envKey: 'AGENT_MEMORY_FEEDBACK_BATCH_TIMEOUT_MS',
      defaultValue: 100,
      description: 'Time in milliseconds before flushing a partial batch.',
      schema: z.number().int().min(0),
      parse: 'int',
    },
  },
};
