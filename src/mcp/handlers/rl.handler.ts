/**
 * RL handlers
 *
 * Handlers for managing reinforcement learning policies
 *
 * NOTE: Non-null assertions used for Map/Record access after existence checks
 * in model and policy management.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import type { AppContext } from '../../core/context.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('rl-handler');
import type { IFileSystemAdapter } from '../../core/adapters/index.js';
import { createLocalFileSystemAdapter } from '../../core/adapters/index.js';
import { createValidationError } from '../../core/errors.js';
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
import { createDatasetFormatService } from '../../services/rl/dataset-format.service.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isBoolean,
  isObject,
  isNumber,
} from '../../utils/type-guards.js';
import type { DatasetParams } from '../../services/rl/training/dataset-builder.js';
import type { TrainingConfig } from '../../services/rl/training/dpo-trainer.js';
import { config as appConfig } from '../../config/index.js';

// =============================================================================
// FILESYSTEM ADAPTER HELPER
// =============================================================================

/**
 * Get the filesystem adapter from context.
 * Falls back to creating a local adapter if not available in context.
 */
function getFileSystemAdapter(context: AppContext): IFileSystemAdapter {
  return context.unifiedAdapters?.fs ?? createLocalFileSystemAdapter();
}

// =============================================================================
// HANDLERS
// =============================================================================

/**
 * Get RL service status and policy states
 */
async function status(context: AppContext, _params: Record<string, unknown>): Promise<unknown> {
  const rlService = context.services.rl;
  if (!rlService) {
    throw createValidationError('rl', 'RL service not available');
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
    throw createValidationError('policy', 'Policy must be extraction, retrieval, or consolidation');
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
async function enable(context: AppContext, params: Record<string, unknown>): Promise<unknown> {
  const policy = getRequiredParam(params, 'policy', isString);
  const enabled = getRequiredParam(params, 'enabled', isBoolean);

  if (!['extraction', 'retrieval', 'consolidation'].includes(policy)) {
    throw createValidationError('policy', 'Policy must be extraction, retrieval, or consolidation');
  }

  const rlService = context.services.rl;
  if (!rlService) {
    throw createValidationError('rl', 'RL service not available');
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
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const policy = getOptionalParam(params, 'policy', isString);
  const configParam = getOptionalParam(params, 'config', isObject);
  const modelPath = getOptionalParam(params, 'modelPath', isString);
  const enabled = getOptionalParam(params, 'enabled', isBoolean);

  const rlService = context.services.rl;
  if (!rlService) {
    throw createValidationError('rl', 'RL service not available');
  }

  // Build config update
  const configUpdate: Record<string, unknown> = {};

  if (policy && (configParam || modelPath !== undefined || enabled !== undefined)) {
    if (!['extraction', 'retrieval', 'consolidation'].includes(policy)) {
      throw createValidationError(
        'policy',
        'Policy must be extraction, retrieval, or consolidation'
      );
    }

    configUpdate[policy] = {
      ...(configParam as Record<string, unknown>),
    };

    if (modelPath !== undefined) {
      (configUpdate[policy] as Record<string, unknown>).modelPath = modelPath;
    }

    if (enabled !== undefined) {
      (configUpdate[policy] as Record<string, unknown>).enabled = enabled;
    }
  } else if (configParam) {
    // Global config update
    Object.assign(configUpdate, configParam);
  }

  rlService.updateConfig(configUpdate);

  return {
    success: true,
    config: rlService.getConfig(),
  };
}

/**
 * Export dataset in various formats
 */
async function exportDataset(
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const fs = getFileSystemAdapter(context);
  const policy = getRequiredParam(params, 'policy', isString);
  const format = getOptionalParam(params, 'format', isString) ?? 'huggingface';
  const outputPath = getRequiredParam(params, 'outputPath', isString);
  const startDate = getOptionalParam(params, 'startDate', isString);
  const endDate = getOptionalParam(params, 'endDate', isString);
  const minConfidence = getOptionalParam(params, 'minConfidence', isNumber);
  const maxExamples = getOptionalParam(params, 'maxExamples', isNumber);
  const evalSplit = getOptionalParam(params, 'evalSplit', isNumber);

  if (!['extraction', 'retrieval', 'consolidation'].includes(policy)) {
    throw createValidationError('policy', 'Policy must be extraction, retrieval, or consolidation');
  }

  // Validate format using service
  const formatService = createDatasetFormatService();
  if (!formatService.isValidFormat(format)) {
    throw createValidationError(
      'format',
      `Format must be one of: ${formatService.getSupportedFormats().join(', ')}`
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

  // Format data using service
  const formatResult = formatService.formatDPOPairs(pairs, {
    policy,
    format,
    outputPath,
  });
  const { content, filename: formattedFilename } = formatResult;

  // Validate and write file
  const resolvedPath = fs.resolve(formattedFilename);
  const outputDir = fs.resolve(outputPath);

  // Security check: ensure path is within intended directory
  if (!resolvedPath.startsWith(outputDir)) {
    throw createValidationError('outputPath', 'Output path would escape intended directory');
  }

  await fs.writeFile(resolvedPath, content, 'utf-8');

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
    throw createValidationError('policy', 'Policy must be extraction, retrieval, or consolidation');
  }

  // Use existing train handler logic with expanded params
  return trainOriginal(_context, { policy, ...params, ...configParam });
}

/**
 * Load a trained model
 */
async function loadModel(context: AppContext, params: Record<string, unknown>): Promise<unknown> {
  const fs = getFileSystemAdapter(context);
  const policy = getRequiredParam(params, 'policy', isString);
  const version = getOptionalParam(params, 'version', isString);

  if (!['extraction', 'retrieval', 'consolidation'].includes(policy)) {
    throw createValidationError('policy', 'Policy must be extraction, retrieval, or consolidation');
  }

  const rlService = context.services.rl;
  if (!rlService) {
    throw createValidationError('rl', 'RL service not available');
  }

  // Determine model path
  const modelsDir = fs.join(appConfig.paths.dataDir, 'models', 'rl', policy);
  let modelPath: string;

  if (version) {
    // Load specific version
    modelPath = fs.join(modelsDir, version);
  } else {
    // Load latest version (most recent directory)
    if (!(await fs.exists(modelsDir))) {
      throw createValidationError('policy', `No trained models found for ${policy}`);
    }

    const dirEntries = await fs.readDir(modelsDir);
    const versions: string[] = [];
    for (const name of dirEntries) {
      const fullPath = fs.join(modelsDir, name);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        versions.push(name);
      }
    }
    versions.sort().reverse();

    if (versions.length === 0) {
      throw createValidationError('policy', `No trained models found for ${policy}`);
    }

    modelPath = fs.join(modelsDir, versions[0]!);
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
    version: version ?? fs.basename(modelPath),
  };
}

/**
 * List available trained models
 */
async function listModels(context: AppContext, _params: Record<string, unknown>): Promise<unknown> {
  const fs = getFileSystemAdapter(context);
  const modelsBaseDir = fs.join(appConfig.paths.dataDir, 'models', 'rl');
  const policies = ['extraction', 'retrieval', 'consolidation'];

  // Model list format varies by policy - using any for flexibility
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const models: Record<string, any[]> = {};

  for (const policy of policies) {
    const policyDir = fs.join(modelsBaseDir, policy);

    if (!(await fs.exists(policyDir))) {
      models[policy] = [];
      continue;
    }

    const dirEntries = await fs.readDir(policyDir);
    const versions: Array<{
      version: string;
      path: string;
      createdAt?: string;
      trainPairs?: number;
      evalPairs?: number;
    }> = [];

    for (const name of dirEntries) {
      const fullPath = fs.join(policyDir, name);
      const stat = await fs.stat(fullPath);

      if (!stat.isDirectory()) continue;

      const versionPath = fullPath;
      const metadataPath = fs.join(versionPath, `${policy}_metadata.json`);

      let metadata: Record<string, unknown> = {};
      if (await fs.exists(metadataPath)) {
        try {
          const content = await fs.readFile(metadataPath, 'utf-8');
          // JSON.parse returns unknown - metadata object structure is validated by usage
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          metadata = JSON.parse(content);
        } catch {
          // Ignore metadata read errors
        }
      }

      versions.push({
        version: name,
        path: versionPath,
        createdAt: metadata.createdAt as string | undefined,
        trainPairs: metadata.trainPairs as number | undefined,
        evalPairs: metadata.evalPairs as number | undefined,
      });
    }

    versions.sort((a, b) => {
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
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const fs = getFileSystemAdapter(context);
  const policy = getRequiredParam(params, 'policy', isString);
  const datasetPath = getOptionalParam(params, 'datasetPath', isString);

  if (!['extraction', 'retrieval', 'consolidation'].includes(policy)) {
    throw createValidationError('policy', 'Policy must be extraction, retrieval, or consolidation');
  }

  const rlService = context.services.rl;
  if (!rlService) {
    throw createValidationError('rl', 'RL service not available');
  }

  // If dataset path provided, use it; otherwise build from feedback
  let dataset;
  if (datasetPath) {
    // Load dataset from file (JSONL format expected)
    // Bug #331 fix: Parse each line with error handling to prevent single bad line crashing batch
    const content = await fs.readFile(datasetPath, 'utf-8');
    const examples: unknown[] = [];
    const lines = content.split('\n').filter((line: string) => line.trim());
    for (let i = 0; i < lines.length; i++) {
      try {
        examples.push(JSON.parse(lines[i]!));
      } catch (error) {
        logger.warn({ line: i + 1, error }, 'Skipping invalid JSONL line in dataset');
      }
    }

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
  // RL policies have generic type parameters - safe to use any for dataset compatibility
  const result = await evaluatePolicy(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    policyInstance as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    dataset.eval.map((ex: any) => ({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      state: ex.state,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      expectedAction: ex.action,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      reward: ex.reward,
    }))
  );

  return {
    success: true,
    policy,
    enabled: policyInstance.isEnabled(),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    hasModel: !!(rlService.getConfig() as any)[policy]?.modelPath,
    datasetSize: dataset.eval.length,
    evaluation: result,
  };
}

/**
 * Compare two models
 */
async function compareModels(
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const fs = getFileSystemAdapter(context);
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

  const rlService = context.services.rl;
  if (!rlService) {
    throw createValidationError('rl', 'RL service not available');
  }

  // Build or load dataset
  // Bug #331 fix: Parse each line with error handling to prevent single bad line crashing batch
  let dataset;
  if (datasetPath) {
    const content = await fs.readFile(datasetPath, 'utf-8');
    const examples: unknown[] = [];
    const lines = content.split('\n').filter((line: string) => line.trim());
    for (let i = 0; i < lines.length; i++) {
      try {
        examples.push(JSON.parse(lines[i]!));
      } catch (error) {
        logger.warn({ line: i + 1, error }, 'Skipping invalid JSONL line in dataset');
      }
    }

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
  // RL policies have generic type parameters - safe to use any for dataset compatibility
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const testData = dataset.eval.map((ex: any) => ({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    state: ex.state,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    expectedAction: ex.action,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    reward: ex.reward,
  }));

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
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
