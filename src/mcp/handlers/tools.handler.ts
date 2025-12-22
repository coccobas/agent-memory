/**
 * Tool registry handlers
 *
 * Uses the generic handler factory to eliminate code duplication.
 */

import {
  type CreateToolInput,
  type UpdateToolInput,
  type ToolWithVersion,
} from '../../db/repositories/tools.js';
import { createCrudHandlers, type CrudHandlers } from './factory.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isObject,
  isArray,
  isToolCategory,
} from '../../utils/type-guards.js';
import {
  validateTextLength,
  validateJsonSize,
  validateArrayLength,
  SIZE_LIMITS,
} from '../../services/validation.service.js';
import type { ScopeType } from '../../db/schema.js';
import type { AppContext } from '../../core/context.js';

// Type-specific extractors for the factory

function extractAddParams(
  params: Record<string, unknown>,
  defaults: { scopeType?: ScopeType; scopeId?: string }
): CreateToolInput {
  const name = getRequiredParam(params, 'name', isString);
  const category = getOptionalParam(params, 'category', isToolCategory);
  const description = getOptionalParam(params, 'description', isString);
  const parameters = getOptionalParam(params, 'parameters', isObject);
  const examples = getOptionalParam(params, 'examples', isArray);
  const constraints = getOptionalParam(params, 'constraints', isString);
  const createdBy = getOptionalParam(params, 'createdBy', isString);

  // Validate input sizes
  validateTextLength(name, 'name', SIZE_LIMITS.NAME_MAX_LENGTH);
  validateTextLength(description, 'description', SIZE_LIMITS.DESCRIPTION_MAX_LENGTH);
  validateJsonSize(parameters, 'parameters', SIZE_LIMITS.PARAMETERS_MAX_BYTES);
  validateJsonSize(examples, 'examples', SIZE_LIMITS.EXAMPLES_MAX_BYTES);

  return {
    scopeType: defaults.scopeType!,
    scopeId: defaults.scopeId,
    name,
    category,
    description,
    parameters,
    examples,
    constraints,
    createdBy,
  };
}

function extractUpdateParams(params: Record<string, unknown>): UpdateToolInput {
  const description = getOptionalParam(params, 'description', isString);
  const parameters = getOptionalParam(params, 'parameters', isObject);
  const examples = getOptionalParam(params, 'examples', isArray);
  const constraints = getOptionalParam(params, 'constraints', isString);
  const changeReason = getOptionalParam(params, 'changeReason', isString);
  const updatedBy = getOptionalParam(params, 'updatedBy', isString);

  // Validate input sizes
  validateTextLength(description, 'description', SIZE_LIMITS.DESCRIPTION_MAX_LENGTH);
  validateJsonSize(parameters, 'parameters', SIZE_LIMITS.PARAMETERS_MAX_BYTES);
  validateJsonSize(examples, 'examples', SIZE_LIMITS.EXAMPLES_MAX_BYTES);

  const input: UpdateToolInput = {};
  if (description !== undefined) input.description = description;
  if (parameters !== undefined) input.parameters = parameters;
  if (examples !== undefined) input.examples = examples;
  if (constraints !== undefined) input.constraints = constraints;
  if (changeReason !== undefined) input.changeReason = changeReason;
  if (updatedBy !== undefined) input.updatedBy = updatedBy;

  return input;
}

function getNameValue(params: Record<string, unknown>): string {
  return getRequiredParam(params, 'name', isString);
}

function getContentForRedFlags(entry: ToolWithVersion): string {
  return entry.currentVersion?.description || '';
}

function getValidationData(
  params: Record<string, unknown>,
  existingEntry?: ToolWithVersion
): Record<string, unknown> {
  const name = existingEntry?.name ?? getOptionalParam(params, 'name', isString);
  const description = getOptionalParam(params, 'description', isString);
  const parameters = getOptionalParam(params, 'parameters', isObject);
  const examples = getOptionalParam(params, 'examples', isArray);
  const constraints = getOptionalParam(params, 'constraints', isString);

  return { name, description, parameters, examples, constraints };
}

function extractListFilters(params: Record<string, unknown>): Record<string, unknown> {
  const category = getOptionalParam(params, 'category', isToolCategory);
  return { category };
}

// Create handlers using factory
const baseHandlers = createCrudHandlers<ToolWithVersion, CreateToolInput, UpdateToolInput>({
  entryType: 'tool',
  getRepo: (context: AppContext) => context.repos.tools,
  responseKey: 'tool',
  responseListKey: 'tools',
  nameField: 'name',
  extractAddParams,
  extractUpdateParams,
  getNameValue,
  getContentForRedFlags,
  getValidationData,
  extractListFilters,
});

// Export with any tool-specific overrides
export const toolHandlers: CrudHandlers = {
  ...baseHandlers,

  // Override bulk_add to include size limit validation
  bulk_add(context: AppContext, params: Record<string, unknown>) {
    const entries = params.entries;
    if (isArray(entries)) {
      validateArrayLength(entries, 'entries', SIZE_LIMITS.BULK_OPERATION_MAX);
    }
    return baseHandlers.bulk_add(context, params);
  },

  // Override bulk_update to include size limit validation
  bulk_update(context: AppContext, params: Record<string, unknown>) {
    const updates = params.updates;
    if (isArray(updates)) {
      validateArrayLength(updates, 'updates', SIZE_LIMITS.BULK_OPERATION_MAX);
    }
    return baseHandlers.bulk_update(context, params);
  },
};
