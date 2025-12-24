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
async function train(
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
 * Evaluate a policy on test data
 */
async function evaluate(
  _context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const policy = getRequiredParam(params, 'policy', isString);
  const startDate = getOptionalParam(params, 'startDate', isString);
  const endDate = getOptionalParam(params, 'endDate', isString);
  const minConfidence = getOptionalParam(params, 'minConfidence', isNumber);
  const maxExamples = getOptionalParam(params, 'maxExamples', isNumber);

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

  // Build dataset for evaluation
  const datasetParams: DatasetParams = {
    startDate,
    endDate,
    minConfidence,
    maxExamples,
    evalSplit: 1.0, // Use all data for evaluation
  };

  let result;
  let policyInstance;

  // Evaluate the specific policy
  if (policy === 'extraction') {
    const dataset = await buildExtractionDataset(datasetParams);
    policyInstance = rlService.getExtractionPolicy();
    result = await evaluatePolicy(
      policyInstance,
      dataset.eval.map((ex) => ({
        state: ex.state,
        expectedAction: ex.action,
        reward: ex.reward,
      }))
    );
  } else if (policy === 'retrieval') {
    const dataset = await buildRetrievalDataset(datasetParams);
    policyInstance = rlService.getRetrievalPolicy();
    result = await evaluatePolicy(
      policyInstance,
      dataset.eval.map((ex) => ({
        state: ex.state,
        expectedAction: ex.action,
        reward: ex.reward,
      }))
    );
  } else if (policy === 'consolidation') {
    const dataset = await buildConsolidationDataset(datasetParams);
    policyInstance = rlService.getConsolidationPolicy();
    result = await evaluatePolicy(
      policyInstance,
      dataset.eval.map((ex) => ({
        state: ex.state,
        expectedAction: ex.action,
        reward: ex.reward,
      }))
    );
  }

  return {
    policy,
    enabled: policyInstance?.isEnabled() ?? false,
    hasModel: !!(policyInstance as any)?.modelPath,
    evaluation: result,
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

// =============================================================================
// EXPORTS
// =============================================================================

export const rlHandlers = {
  status,
  train,
  evaluate,
  enable,
  config: updateConfig,
};
