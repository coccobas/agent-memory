/**
 * Guideline handlers
 *
 * Uses the generic handler factory to eliminate code duplication.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import {
  type CreateGuidelineInput,
  type UpdateGuidelineInput,
  type GuidelineWithVersion,
} from '../../db/repositories/guidelines.js';
import { createCrudHandlers } from './factory.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isNumber,
  isExamplesObject,
  isScopeType,
} from '../../utils/type-guards.js';
import {
  validateTextLength,
  validateJsonSize,
  SIZE_LIMITS,
} from '../../services/validation.service.js';
import type { ScopeType } from '../../db/schema.js';
import type { AppContext } from '../../core/context.js';

// Type-specific extractors for the factory

function extractAddParams(
  params: Record<string, unknown>,
  defaults: { scopeType?: ScopeType; scopeId?: string }
): CreateGuidelineInput {
  const name = getRequiredParam(params, 'name', isString);
  const category = getOptionalParam(params, 'category', isString);
  const priority = getOptionalParam(params, 'priority', isNumber);
  const content = getRequiredParam(params, 'content', isString);
  const rationale = getOptionalParam(params, 'rationale', isString);
  const examples = getOptionalParam(params, 'examples', isExamplesObject);
  const createdBy = getOptionalParam(params, 'createdBy', isString);

  // Validate input sizes
  validateTextLength(name, 'name', SIZE_LIMITS.NAME_MAX_LENGTH);
  validateTextLength(content, 'content', SIZE_LIMITS.CONTENT_MAX_LENGTH);
  if (rationale) {
    validateTextLength(rationale, 'rationale', SIZE_LIMITS.RATIONALE_MAX_LENGTH);
  }
  if (examples) {
    validateJsonSize(examples, 'examples', SIZE_LIMITS.EXAMPLES_MAX_BYTES);
  }

  return {
    scopeType: defaults.scopeType!,
    scopeId: defaults.scopeId,
    name,
    category,
    priority,
    content,
    rationale,
    examples,
    createdBy,
  };
}

function extractUpdateParams(params: Record<string, unknown>): UpdateGuidelineInput {
  const scopeType = getOptionalParam(params, 'scopeType', isScopeType);
  const scopeId = getOptionalParam(params, 'scopeId', isString);
  const category = getOptionalParam(params, 'category', isString);
  const priority = getOptionalParam(params, 'priority', isNumber);
  const content = getOptionalParam(params, 'content', isString);
  const rationale = getOptionalParam(params, 'rationale', isString);
  const examples = getOptionalParam(params, 'examples', isExamplesObject);
  const changeReason = getOptionalParam(params, 'changeReason', isString);
  const updatedBy = getOptionalParam(params, 'updatedBy', isString);

  // Validate input sizes
  if (content) {
    validateTextLength(content, 'content', SIZE_LIMITS.CONTENT_MAX_LENGTH);
  }
  if (rationale) {
    validateTextLength(rationale, 'rationale', SIZE_LIMITS.RATIONALE_MAX_LENGTH);
  }
  if (examples) {
    validateJsonSize(examples, 'examples', SIZE_LIMITS.EXAMPLES_MAX_BYTES);
  }

  const input: UpdateGuidelineInput = {};
  if (scopeType !== undefined) input.scopeType = scopeType as ScopeType;
  if (scopeId !== undefined) input.scopeId = scopeId;
  if (category !== undefined) input.category = category;
  if (priority !== undefined) input.priority = priority;
  if (content !== undefined) input.content = content;
  if (rationale !== undefined) input.rationale = rationale;
  if (examples !== undefined) input.examples = examples as { bad?: string[]; good?: string[] };
  if (changeReason !== undefined) input.changeReason = changeReason;
  if (updatedBy !== undefined) input.updatedBy = updatedBy;

  return input;
}

function getNameValue(params: Record<string, unknown>): string {
  return getRequiredParam(params, 'name', isString);
}

function getContentForRedFlags(entry: GuidelineWithVersion): string {
  return entry.currentVersion?.content || '';
}

function getValidationData(
  params: Record<string, unknown>,
  existingEntry?: GuidelineWithVersion
): Record<string, unknown> {
  const name = existingEntry?.name ?? getOptionalParam(params, 'name', isString);
  const content =
    getOptionalParam(params, 'content', isString) ?? existingEntry?.currentVersion?.content;
  const rationale = getOptionalParam(params, 'rationale', isString);
  const priority = getOptionalParam(params, 'priority', isNumber);
  const category = getOptionalParam(params, 'category', isString);

  return { name, content, rationale, priority, category };
}

function extractListFilters(params: Record<string, unknown>): Record<string, unknown> {
  const category = getOptionalParam(params, 'category', isString);
  return { category };
}

// Create handlers using factory
export const guidelineHandlers = createCrudHandlers<
  GuidelineWithVersion,
  CreateGuidelineInput,
  UpdateGuidelineInput
>({
  entryType: 'guideline',
  getRepo: (context: AppContext) => context.repos.guidelines,
  responseKey: 'guideline',
  responseListKey: 'guidelines',
  nameField: 'name',
  extractAddParams,
  extractUpdateParams,
  getNameValue,
  getContentForRedFlags,
  getValidationData,
  extractListFilters,
});
