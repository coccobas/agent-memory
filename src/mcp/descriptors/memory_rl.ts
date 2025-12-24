/**
 * memory_rl tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { rlHandlers } from '../handlers/rl.handler.js';

export const memoryRlDescriptor: ToolDescriptor = {
  name: 'memory_rl',
  description: `Manage RL policies for memory operations.

Actions: status, train, evaluate, enable, config

Control reinforcement learning policies that optimize extraction, retrieval, and consolidation decisions.
Example: {"action":"status"}
Example: {"action":"enable","policy":"extraction","enabled":true}`,
  commonParams: {
    policy: {
      type: 'string',
      enum: ['extraction', 'retrieval', 'consolidation'],
      description: 'Target policy',
    },
    enabled: { type: 'boolean', description: 'Enable/disable policy' },
    modelPath: { type: 'string', description: 'Path to trained model file' },
    config: { type: 'object', description: 'Policy configuration' },
    startDate: { type: 'string', description: 'Training data start date (ISO)' },
    endDate: { type: 'string', description: 'Training data end date (ISO)' },
    minConfidence: { type: 'number', description: 'Minimum confidence threshold' },
    maxExamples: { type: 'number', description: 'Max training examples' },
    evalSplit: { type: 'number', description: 'Evaluation split ratio (0-1)' },
  },
  actions: {
    status: { contextHandler: rlHandlers.status },
    train: { contextHandler: rlHandlers.train },
    evaluate: { contextHandler: rlHandlers.evaluate },
    enable: { contextHandler: rlHandlers.enable },
    config: { contextHandler: rlHandlers.config },
  },
};
