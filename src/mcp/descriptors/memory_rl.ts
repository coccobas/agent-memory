/**
 * memory_rl tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { rlHandlers } from '../handlers/rl.handler.js';

export const memoryRlDescriptor: ToolDescriptor = {
  name: 'memory_rl',
  visibility: 'advanced',
  description: `Manage RL policies for memory operations.

Actions: status, train, evaluate, enable, config, export_dataset, load_model, list_models, compare

Control reinforcement learning policies that optimize extraction, retrieval, and consolidation decisions.
Example: {"action":"status"}
Example: {"action":"enable","policy":"extraction","enabled":true}
Example: {"action":"export_dataset","policy":"extraction","format":"huggingface","outputPath":"./datasets"}
Example: {"action":"load_model","policy":"extraction","version":"latest"}
Example: {"action":"compare","policyA":"extraction","policyB":"retrieval"}`,
  commonParams: {
    policy: {
      type: 'string',
      enum: ['extraction', 'retrieval', 'consolidation'],
      description: 'Target policy',
    },
    policyA: {
      type: 'string',
      enum: ['extraction', 'retrieval', 'consolidation'],
      description: 'First policy for comparison',
    },
    policyB: {
      type: 'string',
      enum: ['extraction', 'retrieval', 'consolidation'],
      description: 'Second policy for comparison',
    },
    enabled: { type: 'boolean', description: 'Enable/disable policy' },
    modelPath: { type: 'string', description: 'Path to trained model file' },
    version: { type: 'string', description: 'Model version to load (default: latest)' },
    config: {
      type: 'object',
      description: 'Policy configuration (epochs, batchSize, learningRate, beta, outputPath)',
    },
    format: {
      type: 'string',
      enum: ['huggingface', 'openai', 'csv', 'jsonl'],
      description: 'Export format for dataset',
    },
    outputPath: { type: 'string', description: 'Output directory path for exports' },
    datasetPath: { type: 'string', description: 'Path to dataset file for evaluation' },
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
    export_dataset: { contextHandler: rlHandlers.export_dataset },
    load_model: { contextHandler: rlHandlers.load_model },
    list_models: { contextHandler: rlHandlers.list_models },
    compare: { contextHandler: rlHandlers.compare },
  },
};
