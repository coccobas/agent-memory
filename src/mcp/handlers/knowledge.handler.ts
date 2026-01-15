/**
 * Knowledge handlers
 *
 * Uses the generic handler factory to eliminate code duplication.
 */

import {
  type CreateKnowledgeInput,
  type UpdateKnowledgeInput,
  type KnowledgeWithVersion,
} from '../../db/repositories/knowledge.js';
import { createCrudHandlers } from './factory.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isNumber,
  isISODateString,
  isScopeType,
} from '../../utils/type-guards.js';
import {
  validateTextLength,
  SIZE_LIMITS,
} from '../../services/validation.service.js';
import type { ScopeType } from '../../db/schema.js';
import type { AppContext } from '../../core/context.js';

type KnowledgeCategory = 'decision' | 'fact' | 'context' | 'reference' | undefined;

// Type-specific extractors for the factory

function extractAddParams(
  params: Record<string, unknown>,
  defaults: { scopeType?: ScopeType; scopeId?: string }
): CreateKnowledgeInput {
  const title = getRequiredParam(params, 'title', isString);
  const category = getOptionalParam(params, 'category', isString) as KnowledgeCategory;
  const content = getRequiredParam(params, 'content', isString);
  const source = getOptionalParam(params, 'source', isString);
  const confidence = getOptionalParam(params, 'confidence', isNumber);
  const validFrom = getOptionalParam(params, 'validFrom', isISODateString);
  const validUntil = getOptionalParam(params, 'validUntil', isISODateString);
  const createdBy = getOptionalParam(params, 'createdBy', isString);

  // Validate input sizes
  validateTextLength(title, 'title', SIZE_LIMITS.TITLE_MAX_LENGTH);
  validateTextLength(content, 'content', SIZE_LIMITS.CONTENT_MAX_LENGTH);
  if (source) {
    validateTextLength(source, 'source', SIZE_LIMITS.DESCRIPTION_MAX_LENGTH);
  }

  return {
    scopeType: defaults.scopeType!,
    scopeId: defaults.scopeId,
    title,
    category,
    content,
    source,
    confidence,
    validFrom,
    validUntil,
    createdBy,
  };
}

function extractUpdateParams(params: Record<string, unknown>): UpdateKnowledgeInput {
  const scopeType = getOptionalParam(params, 'scopeType', isScopeType);
  const scopeId = getOptionalParam(params, 'scopeId', isString);
  const category = getOptionalParam(params, 'category', isString) as KnowledgeCategory;
  const content = getOptionalParam(params, 'content', isString);
  const source = getOptionalParam(params, 'source', isString);
  const confidence = getOptionalParam(params, 'confidence', isNumber);
  const validFrom = getOptionalParam(params, 'validFrom', isISODateString);
  const validUntil = getOptionalParam(params, 'validUntil', isISODateString);
  const invalidatedBy = getOptionalParam(params, 'invalidatedBy', isString);
  const changeReason = getOptionalParam(params, 'changeReason', isString);
  const updatedBy = getOptionalParam(params, 'updatedBy', isString);

  // Validate input sizes
  if (content) {
    validateTextLength(content, 'content', SIZE_LIMITS.CONTENT_MAX_LENGTH);
  }
  if (source) {
    validateTextLength(source, 'source', SIZE_LIMITS.DESCRIPTION_MAX_LENGTH);
  }

  const input: UpdateKnowledgeInput = {};
  if (scopeType !== undefined) input.scopeType = scopeType as ScopeType;
  if (scopeId !== undefined) input.scopeId = scopeId;
  if (category !== undefined) input.category = category;
  if (content !== undefined) input.content = content;
  if (source !== undefined) input.source = source;
  if (confidence !== undefined) input.confidence = confidence;
  if (validFrom !== undefined) input.validFrom = validFrom;
  if (validUntil !== undefined) input.validUntil = validUntil;
  if (invalidatedBy !== undefined) input.invalidatedBy = invalidatedBy;
  if (changeReason !== undefined) input.changeReason = changeReason;
  if (updatedBy !== undefined) input.updatedBy = updatedBy;

  return input;
}

function getNameValue(params: Record<string, unknown>): string {
  return getRequiredParam(params, 'title', isString);
}

function getContentForRedFlags(entry: KnowledgeWithVersion): string {
  return entry.currentVersion?.content || '';
}

function getValidationData(
  params: Record<string, unknown>,
  existingEntry?: KnowledgeWithVersion
): Record<string, unknown> {
  const title = existingEntry?.title ?? getOptionalParam(params, 'title', isString);
  const content =
    getOptionalParam(params, 'content', isString) ?? existingEntry?.currentVersion?.content;
  const source = getOptionalParam(params, 'source', isString);
  const confidence = getOptionalParam(params, 'confidence', isNumber);
  const validFrom = getOptionalParam(params, 'validFrom', isISODateString);
  const validUntil = getOptionalParam(params, 'validUntil', isISODateString);
  const category = getOptionalParam(params, 'category', isString);

  return { title, content, source, confidence, validFrom, validUntil, category };
}

function extractListFilters(params: Record<string, unknown>): Record<string, unknown> {
  const category = getOptionalParam(params, 'category', isString) as KnowledgeCategory;
  return { category };
}

// Create handlers using factory
export const knowledgeHandlers = createCrudHandlers<
  KnowledgeWithVersion,
  CreateKnowledgeInput,
  UpdateKnowledgeInput
>({
  entryType: 'knowledge',
  getRepo: (context: AppContext) => context.repos.knowledge,
  responseKey: 'knowledge',
  responseListKey: 'knowledge',
  nameField: 'title',
  extractAddParams,
  extractUpdateParams,
  getNameValue,
  getContentForRedFlags,
  getValidationData,
  extractListFilters,
});
