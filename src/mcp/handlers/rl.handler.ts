/**
 * RL handlers
 *
 * Handlers for managing reinforcement learning policies
 */

import type { AppContext } from '../../core/context.js';
import { getRLService, initRLService } from '../../services/rl/index.js';
import {
  buildExtractionDataset,
  buildRetrievalDataset,
  buildConsolidationDataset,
  trainExtractionPolicy,
  trainRetrievalPolicy,
  trainConsolidationPolicy,
  evaluatePolicy,
  comparePolicies,
  formatExtractionForDPO,
  formatRetrievalForDPO,
  formatConsolidationForDPO,
} from '../../services/rl/training/index.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isBoolean,
  isObject,
  isNumber,
} from '../../utils/type-guards.js';
import { createValidationError } from '../../core/errors.js';
import type { DatasetParams } from '../../services/rl/training/dataset-builder.js';
import type { TrainingConfig } from '../../services/rl/training/dpo-trainer.js';
import { writeFileSync, existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { config } from '../../config/index.js';

// =============================================================================
// HANDLERS
// =============================================================================

/**
 * Get RL service status and policy states
 */
async function status(
  _context: AppContext,
  _params: Record<string, unknown>
): Promise<unknown> {
  let rlService = getRLService();

  // Initialize if not already initialized
  if (!rlService) {
    rlService = initRLService();
  }

  return rlService.getStatus();
}

/**
 * Train a policy from collected feedback
 */
async function trainOriginal(
  _context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const policy = getRequiredParam(params, 'policy', isString);
  const modelPath = getOptionalParam(params, 'modelPath', isString);
  const startDate = getOptionalParam(params, 'startDate', isString);
  const endDate = getOptionalParam(params, 'endDate', isString);
  const minConfidence = getOptionalParam(params, 'minConfidence', isNumber);
  const maxExamples = getOptionalParam(params, 'maxExamples', isNumber);
  const evalSplit = getOptionalParam(params, 'evalSplit', isNumber);

  if (!['extraction', 'retrieval', 'consolidation'].includes(policy)) {
    throw createValidationError(
      'policy',
      'Policy must be extraction, retrieval, or consolidation'
    );
  }

  // Build dataset parameters
  const datasetParams: DatasetParams = {
    startDate,
    endDate,
    minConfidence,
    maxExamples,
    evalSplit,
  };

  // Build training config
  const trainingConfig: TrainingConfig = {
    modelName: `${policy}-policy`,
    outputPath: modelPath ?? `./models/rl/${policy}`,
  };

  let result;

  // Train the specific policy
  if (policy === 'extraction') {
    const dataset = await buildExtractionDataset(datasetParams);
    result = await trainExtractionPolicy(dataset, trainingConfig);
  } else if (policy === 'retrieval') {
    const dataset = await buildRetrievalDataset(datasetParams);
    result = await trainRetrievalPolicy(dataset, trainingConfig);
  } else if (policy === 'consolidation') {
    const dataset = await buildConsolidationDataset(datasetParams);
    result = await trainConsolidationPolicy(dataset, trainingConfig);
  }

  return {
    policy,
    success: result?.success ?? false,
    modelPath: result?.modelPath,
    metrics: result?.metrics,
    error: result?.error,
  };
}

/**
 * Enable or disable a policy
 */
async function enable(
  _context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const policy = getRequiredParam(params, 'policy', isString);
  const enabled = getRequiredParam(params, 'enabled', isBoolean);

  if (!['extraction', 'retrieval', 'consolidation'].includes(policy)) {
    throw createValidationError(
      'policy',
      'Policy must be extraction, retrieval, or consolidation'
    );
  }

  let rlService = getRLService();
  if (!rlService) {
    rlService = initRLService();
  }

  // Update config to enable/disable the policy
  rlService.updateConfig({
    [policy]: {
      enabled,
    },
  });

  return {
    success: true,
    policy,
    enabled,
  };
}

/**
 * Update policy configuration
 */
async function updateConfig(
  _context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const policy = getOptionalParam(params, 'policy', isString);
  const config = getOptionalParam(params, 'config', isObject);
  const modelPath = getOptionalParam(params, 'modelPath', isString);
  const enabled = getOptionalParam(params, 'enabled', isBoolean);

  let rlService = getRLService();
  if (!rlService) {
    rlService = initRLService();
  }

  // Build config update
  const updateConfig: any = {};

  if (policy && (config || modelPath !== undefined || enabled !== undefined)) {
    if (!['extraction', 'retrieval', 'consolidation'].includes(policy)) {
      throw createValidationError(
        'policy',
        'Policy must be extraction, retrieval, or consolidation'
      );
    }

    updateConfig[policy] = {
      ...(config as any),
    };

    if (modelPath !== undefined) {
      updateConfig[policy].modelPath = modelPath;
    }

    if (enabled !== undefined) {
      updateConfig[policy].enabled = enabled;
    }
  } else if (config) {
    // Global config update
    Object.assign(updateConfig, config);
  }

  rlService.updateConfig(updateConfig);

  return {
    success: true,
    config: rlService.getConfig(),
  };
}

/**
 * Export dataset in various formats
 */
async function exportDataset(
  _context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const policy = getRequiredParam(params, 'policy', isString);
  const format = getOptionalParam(params, 'format', isString) ?? 'huggingface';
  const outputPath = getRequiredParam(params, 'outputPath', isString);
  const startDate = getOptionalParam(params, 'startDate', isString);
  const endDate = getOptionalParam(params, 'endDate', isString);
  const minConfidence = getOptionalParam(params, 'minConfidence', isNumber);
  const maxExamples = getOptionalParam(params, 'maxExamples', isNumber);
  const evalSplit = getOptionalParam(params, 'evalSplit', isNumber);

  if (!['extraction', 'retrieval', 'consolidation'].includes(policy)) {
    throw createValidationError(
      'policy',
      'Policy must be extraction, retrieval, or consolidation'
    );
  }

  if (!['huggingface', 'openai', 'csv', 'jsonl'].includes(format)) {
    throw createValidationError(
      'format',
      'Format must be huggingface, openai, csv, or jsonl'
    );
  }

  // Build dataset parameters
  const datasetParams: DatasetParams = {
    startDate,
    endDate,
    minConfidence,
    maxExamples,
    evalSplit,
  };

  // Build dataset based on policy type
  let dataset;
  let pairs;

  if (policy === 'extraction') {
    dataset = await buildExtractionDataset(datasetParams);
    pairs = formatExtractionForDPO(dataset.train);
  } else if (policy === 'retrieval') {
    dataset = await buildRetrievalDataset(datasetParams);
    pairs = formatRetrievalForDPO(dataset.train);
  } else {
    dataset = await buildConsolidationDataset(datasetParams);
    pairs = formatConsolidationForDPO(dataset.train);
  }

  // Format data based on requested format
  let content: string;
  let filename: string;

  switch (format) {
    case 'huggingface':
      // Hugging Face DPO format (JSONL with prompt, chosen, rejected)
      content = pairs.map((p) => JSON.stringify(p)).join('\n');
      filename = join(outputPath, `${policy}_dpo_train.jsonl`);
      break;

    case 'openai':
      // OpenAI fine-tuning format (JSONL with messages)
      content = pairs
        .map((p) =>
          JSON.stringify({
            messages: [
              { role: 'user', content: p.prompt },
              { role: 'assistant', content: p.chosen },
            ],
          })
        )
        .join('\n');
      filename = join(outputPath, `${policy}_openai_train.jsonl`);
      break;

    case 'csv':
      // CSV format
      const headers = 'prompt,chosen,rejected\n';
      const rows = pairs
        .map((p) => {
          const escapeCsv = (str: string) =>
            `"${str.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
          return `${escapeCsv(p.prompt)},${escapeCsv(p.chosen)},${escapeCsv(p.rejected)}`;
        })
        .join('\n');
      content = headers + rows;
      filename = join(outputPath, `${policy}_train.csv`);
      break;

    case 'jsonl':
    default:
      // Standard JSONL format (full dataset)
      content = dataset.train.map((ex) => JSON.stringify(ex)).join('\n');
      filename = join(outputPath, `${policy}_train.jsonl`);
      break;
  }

  // Validate and write file
  const resolvedPath = resolve(filename);
  const outputDir = resolve(outputPath);

  // Security check: ensure path is within intended directory
  if (!resolvedPath.startsWith(outputDir)) {
    throw createValidationError(
      'outputPath',
      'Output path would escape intended directory'
    );
  }

  writeFileSync(resolvedPath, content, 'utf-8');

  return {
    success: true,
    policy,
    format,
    outputPath: resolvedPath,
    examples: pairs.length,
    stats: dataset.stats,
  };
}

/**
 * Train a policy (exports dataset + generates training script)
 */
async function trainPolicy(
  _context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const policy = getRequiredParam(params, 'policy', isString);
  const configParam = getOptionalParam(params, 'config', isObject);

  if (!['extraction', 'retrieval', 'consolidation'].includes(policy)) {
    throw createValidationError(
      'policy',
      'Policy must be extraction, retrieval, or consolidation'
    );
  }

  // Use existing train handler logic with expanded params
  return trainOriginal(_context, { policy, ...params, ...configParam });
}

/**
 * Load a trained model
 */
async function loadModel(
  _context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const policy = getRequiredParam(params, 'policy', isString);
  const version = getOptionalParam(params, 'version', isString);

  if (!['extraction', 'retrieval', 'consolidation'].includes(policy)) {
    throw createValidationError(
      'policy',
      'Policy must be extraction, retrieval, or consolidation'
    );
  }

  let rlService = getRLService();
  if (!rlService) {
    rlService = initRLService();
  }

  // Determine model path
  const modelsDir = join(config.paths.dataDir, 'models', 'rl', policy);
  let modelPath: string;

  if (version) {
    // Load specific version
    modelPath = join(modelsDir, version);
  } else {
    // Load latest version (most recent directory)
    if (!existsSync(modelsDir)) {
      throw createValidationError('policy', `No trained models found for ${policy}`);
    }

    const versions = readdirSync(modelsDir)
      .filter((name) => {
        const fullPath = join(modelsDir, name);
        return statSync(fullPath).isDirectory();
      })
      .sort()
      .reverse();

    if (versions.length === 0) {
      throw createValidationError('policy', `No trained models found for ${policy}`);
    }

    modelPath = join(modelsDir, versions[0]!);
  }

  // Update config to use the model
  rlService.updateConfig({
    [policy]: {
      enabled: true,
      modelPath,
    },
  });

  return {
    success: true,
    policy,
    modelPath,
    version: version ?? basename(modelPath),
  };
}

/**
 * List available trained models
 */
async function listModels(
  _context: AppContext,
  _params: Record<string, unknown>
): Promise<unknown> {
  const modelsBaseDir = join(config.paths.dataDir, 'models', 'rl');
  const policies = ['extraction', 'retrieval', 'consolidation'];

  const models: Record<string, any[]> = {};

  for (const policy of policies) {
    const policyDir = join(modelsBaseDir, policy);

    if (!existsSync(policyDir)) {
      models[policy] = [];
      continue;
    }

    const versions = readdirSync(policyDir)
      .filter((name) => {
        const fullPath = join(policyDir, name);
        return statSync(fullPath).isDirectory();
      })
      .map((version) => {
        const versionPath = join(policyDir, version);
        const metadataPath = join(versionPath, `${policy}_metadata.json`);

        let metadata: any = {};
        if (existsSync(metadataPath)) {
          try {
            metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
          } catch (error) {
            // Ignore metadata read errors
          }
        }

        return {
          version,
          path: versionPath,
          createdAt: metadata.createdAt,
          trainPairs: metadata.trainPairs,
          evalPairs: metadata.evalPairs,
        };
      })
      .sort((a, b) => {
        // Sort by createdAt descending
        if (a.createdAt && b.createdAt) {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return b.version.localeCompare(a.version);
      });

    models[policy] = versions;
  }

  return {
    success: true,
    models,
  };
}

/**
 * Evaluate a model on held-out data
 */
async function evaluateModel(
  _context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const policy = getRequiredParam(params, 'policy', isString);
  const datasetPath = getOptionalParam(params, 'datasetPath', isString);

  if (!['extraction', 'retrieval', 'consolidation'].includes(policy)) {
    throw createValidationError(
      'policy',
      'Policy must be extraction, retrieval, or consolidation'
    );
  }

  const rlService = getRLService();
  if (!rlService) {
    throw createValidationError('rl', 'RL service not initialized');
  }

  // If dataset path provided, use it; otherwise build from feedback
  let dataset;
  if (datasetPath) {
    // Load dataset from file (JSONL format expected)
    const content = readFileSync(datasetPath, 'utf-8');
    const examples = content
      .split('\n')
      .filter((line: string) => line.trim())
      .map((line: string) => JSON.parse(line));

    dataset = {
      eval: examples,
      train: [],
      stats: {
        totalExamples: examples.length,
        trainExamples: 0,
        evalExamples: examples.length,
        dateRange: { start: '', end: '' },
      },
    };
  } else {
    // Build dataset from feedback
    const datasetParams: DatasetParams = {
      evalSplit: 1.0, // Use all data for evaluation
    };

    if (policy === 'extraction') {
      dataset = await buildExtractionDataset(datasetParams);
    } else if (policy === 'retrieval') {
      dataset = await buildRetrievalDataset(datasetParams);
    } else {
      dataset = await buildConsolidationDataset(datasetParams);
    }
  }

  // Get policy instance
  let policyInstance;
  if (policy === 'extraction') {
    policyInstance = rlService.getExtractionPolicy();
  } else if (policy === 'retrieval') {
    policyInstance = rlService.getRetrievalPolicy();
  } else {
    policyInstance = rlService.getConsolidationPolicy();
  }

  // Evaluate (using type assertion for policy flexibility)
  const result = await evaluatePolicy(
    policyInstance as any,
    dataset.eval.map((ex: any) => ({
      state: ex.state,
      expectedAction: ex.action,
      reward: ex.reward,
    }))
  );

  return {
    success: true,
    policy,
    enabled: policyInstance.isEnabled(),
    hasModel: !!(rlService.getConfig() as any)[policy]?.modelPath,
    datasetSize: dataset.eval.length,
    evaluation: result,
  };
}

/**
 * Compare two models
 */
async function compareModels(
  _context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const policyA = getRequiredParam(params, 'policyA', isString);
  const policyB = getRequiredParam(params, 'policyB', isString);
  const datasetPath = getOptionalParam(params, 'datasetPath', isString);

  if (!['extraction', 'retrieval', 'consolidation'].includes(policyA)) {
    throw createValidationError(
      'policyA',
      'Policy must be extraction, retrieval, or consolidation'
    );
  }

  if (!['extraction', 'retrieval', 'consolidation'].includes(policyB)) {
    throw createValidationError(
      'policyB',
      'Policy must be extraction, retrieval, or consolidation'
    );
  }

  // For now, require same policy type for comparison
  if (policyA !== policyB) {
    throw createValidationError(
      'policy',
      'Currently only supports comparing models of the same policy type'
    );
  }

  const rlService = getRLService();
  if (!rlService) {
    throw createValidationError('rl', 'RL service not initialized');
  }

  // Build or load dataset
  let dataset;
  if (datasetPath) {
    const content = readFileSync(datasetPath, 'utf-8');
    const examples = content
      .split('\n')
      .filter((line: string) => line.trim())
      .map((line: string) => JSON.parse(line));

    dataset = {
      eval: examples,
      train: [],
      stats: {
        totalExamples: examples.length,
        trainExamples: 0,
        evalExamples: examples.length,
        dateRange: { start: '', end: '' },
      },
    };
  } else {
    const datasetParams: DatasetParams = {
      evalSplit: 1.0,
    };

    if (policyA === 'extraction') {
      dataset = await buildExtractionDataset(datasetParams);
    } else if (policyA === 'retrieval') {
      dataset = await buildRetrievalDataset(datasetParams);
    } else {
      dataset = await buildConsolidationDataset(datasetParams);
    }
  }

  // Get policy instances (for now, using the same instance twice as placeholder)
  // In a real implementation, you'd load two different model versions
  let policyInstance;
  if (policyA === 'extraction') {
    policyInstance = rlService.getExtractionPolicy();
  } else if (policyA === 'retrieval') {
    policyInstance = rlService.getRetrievalPolicy();
  } else {
    policyInstance = rlService.getConsolidationPolicy();
  }

  // Compare (for now, comparing policy against itself as placeholder)
  const testData = dataset.eval.map((ex: any) => ({
    state: ex.state,
    expectedAction: ex.action,
    reward: ex.reward,
  }));

  const result = await comparePolicies(policyInstance as any, policyInstance as any, testData);

  return {
    success: true,
    policyA,
    policyB,
    datasetSize: dataset.eval.length,
    comparison: result,
    note: 'Currently comparing same policy instance - implement model versioning for true A/B testing',
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export const rlHandlers = {
  status,
  train: trainPolicy,
  evaluate: evaluateModel,
  enable,
  config: updateConfig,
  export_dataset: exportDataset,
  load_model: loadModel,
  list_models: listModels,
  compare: compareModels,
};
