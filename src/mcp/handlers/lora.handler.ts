/**
 * LoRA Handler
 *
 * Thin handler that validates input and delegates to LoraService.
 * Handles exporting guidelines as LoRA training data for model fine-tuning.
 */

import { join } from 'node:path';
import { config } from '../../config/index.js';
import { createValidationError, createPermissionError } from '../../core/errors.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isNumber,
  isBoolean,
  isObject,
} from '../../utils/type-guards.js';
import { requireAdminKey } from '../../utils/admin.js';
import type { AppContext } from '../../core/context.js';
import type { ExportFormat, GuidelineFilter } from '../../services/lora.service.js';

// =============================================================================
// HANDLERS
// =============================================================================

/**
 * Export guidelines as LoRA training data
 */
async function exportLoRA(context: AppContext, params: Record<string, unknown>): Promise<unknown> {
  // Require admin key for export operations
  requireAdminKey(params);

  // Extract and validate parameters
  const targetModel = getRequiredParam(params, 'targetModel', isString);
  const format = (getOptionalParam(params, 'format', isString) || 'huggingface') as ExportFormat;
  const outputPath = getRequiredParam(params, 'outputPath', isString);
  const includeExamples = getOptionalParam(params, 'includeExamples', isBoolean) ?? true;
  const examplesPerGuideline = getOptionalParam(params, 'examplesPerGuideline', isNumber) ?? 3;
  const guidelineFilter = getOptionalParam(params, 'guidelineFilter', isObject) as
    | GuidelineFilter
    | undefined;
  const trainEvalSplit = getOptionalParam(params, 'trainEvalSplit', isNumber) ?? 0.9;
  const agentId = getRequiredParam(params, 'agentId', isString);

  // Validate format
  if (!['huggingface', 'openai', 'anthropic', 'alpaca'].includes(format)) {
    throw createValidationError('format', 'must be huggingface, openai, anthropic, or alpaca');
  }

  // Validate split ratio
  if (trainEvalSplit < 0 || trainEvalSplit > 1) {
    throw createValidationError('trainEvalSplit', 'must be between 0 and 1');
  }

  // Check read permission for guidelines
  const scopeType = guidelineFilter?.scopeType ?? 'global';
  const scopeId = guidelineFilter?.scopeId;

  if (
    !context.services.permission.check(
      agentId,
      'read',
      'guideline',
      null,
      scopeType,
      scopeId ?? null
    )
  ) {
    throw createPermissionError('read', 'guideline', 'LoRA export');
  }

  // Get service from context
  const loraService = context.services.lora;
  if (!loraService) {
    throw createValidationError('lora', 'LoRA service not available');
  }

  try {
    const result = await loraService.exportToFiles(context.repos.guidelines, {
      targetModel,
      format,
      outputPath,
      includeExamples,
      examplesPerGuideline,
      guidelineFilter: guidelineFilter || {},
      trainEvalSplit,
    });

    return result;
  } catch (error) {
    if (error instanceof Error && error.message.includes('No guidelines found')) {
      throw createValidationError(
        'guidelineFilter',
        'No guidelines found matching the filter criteria'
      );
    }
    throw error;
  }
}

/**
 * List existing adapter configurations
 */
async function listAdapters(
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const outputPath = getOptionalParam(params, 'outputPath', isString);
  const searchPath = outputPath || join(config.paths.dataDir, 'lora');

  const loraService = context.services.lora;
  if (!loraService) {
    throw createValidationError('lora', 'LoRA service not available');
  }

  return loraService.listAdapters(searchPath);
}

/**
 * Generate training script for a target model
 */
async function generateScript(
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const targetModel = getRequiredParam(params, 'targetModel', isString);
  const format = (getOptionalParam(params, 'format', isString) || 'huggingface') as ExportFormat;
  const datasetPath = getRequiredParam(params, 'datasetPath', isString);
  const outputPath = getOptionalParam(params, 'outputPath', isString);

  // Validate format
  if (!['huggingface', 'openai', 'anthropic', 'alpaca'].includes(format)) {
    throw createValidationError('format', 'must be huggingface, openai, anthropic, or alpaca');
  }

  // Require admin key if writing to disk
  if (outputPath) {
    requireAdminKey(params);
  }

  const loraService = context.services.lora;
  if (!loraService) {
    throw createValidationError('lora', 'LoRA service not available');
  }

  return loraService.generateScript(targetModel, format, datasetPath, outputPath);
}

// =============================================================================
// EXPORTS
// =============================================================================

export const loraHandlers = {
  export: (context: AppContext, params: Record<string, unknown>) => exportLoRA(context, params),
  list_adapters: (context: AppContext, params: Record<string, unknown>) =>
    listAdapters(context, params),
  generate_script: (context: AppContext, params: Record<string, unknown>) =>
    generateScript(context, params),
};
