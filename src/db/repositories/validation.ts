/**
 * Repository Validation Helpers
 *
 * Shared validation functions for repository input validation.
 * These run at the repository layer to catch invalid data early.
 *
 * Validation functions throw errors for invalid input but don't transform types.
 * The original input is passed through after validation.
 */

import { createValidationError } from '../../core/errors.js';
import type { ScopeType } from '../schema.js';

// =============================================================================
// COMMON VALIDATORS
// =============================================================================

/**
 * Validate that a required string field is present and non-empty
 */
export function validateRequiredString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw createValidationError(fieldName, 'is required and must be a non-empty string');
  }
}

/**
 * Validate that a string field is valid if provided
 */
export function validateOptionalString(value: unknown, fieldName: string): void {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw createValidationError(fieldName, 'must be a string');
  }
}

/**
 * Validate priority is in valid range (0-100)
 */
export function validatePriority(priority: unknown): void {
  if (priority !== undefined && priority !== null) {
    if (typeof priority !== 'number' || priority < 0 || priority > 100) {
      throw createValidationError('priority', 'must be a number between 0 and 100');
    }
  }
}

/**
 * Validate confidence is in valid range (0-1)
 */
export function validateConfidence(confidence: unknown): void {
  if (confidence !== undefined && confidence !== null) {
    if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
      throw createValidationError('confidence', 'must be a number between 0 and 1');
    }
  }
}

/**
 * Validate scope type and scopeId combination
 */
export function validateScope(scopeType: ScopeType, scopeId: string | undefined | null): void {
  if (scopeType !== 'global' && !scopeId) {
    throw createValidationError('scopeId', `is required when scopeType is '${scopeType}'`);
  }
}

/**
 * Validate category string length
 */
export function validateCategory(category: unknown): void {
  if (category !== undefined && category !== null) {
    if (typeof category !== 'string') {
      throw createValidationError('category', 'must be a string');
    }
    if (category.length > 100) {
      throw createValidationError('category', 'must be 100 characters or less');
    }
  }
}

// =============================================================================
// ENTRY VALIDATORS
// =============================================================================

/**
 * Validate guideline create input
 * Throws validation errors if input is invalid.
 */
export function validateGuidelineInput(input: {
  name?: string;
  content?: string;
  scopeType?: ScopeType;
  scopeId?: string | null;
  category?: string | null;
  priority?: number | null;
  rationale?: string | null;
  createdBy?: string | null;
}): void {
  validateRequiredString(input.name, 'name');
  validateRequiredString(input.content, 'content');
  validateScope(input.scopeType || 'global', input.scopeId);
  validateCategory(input.category);
  validatePriority(input.priority);
  validateOptionalString(input.rationale, 'rationale');
  validateOptionalString(input.createdBy, 'createdBy');
}

/**
 * Validate knowledge create input
 * Throws validation errors if input is invalid.
 */
export function validateKnowledgeInput(input: {
  title?: string;
  content?: string;
  scopeType?: ScopeType;
  scopeId?: string | null;
  category?: string | null;
  confidence?: number | null;
  source?: string | null;
  createdBy?: string | null;
}): void {
  validateRequiredString(input.title, 'title');
  validateRequiredString(input.content, 'content');
  validateScope(input.scopeType || 'global', input.scopeId);
  validateCategory(input.category);
  validateConfidence(input.confidence);
  validateOptionalString(input.source, 'source');
  validateOptionalString(input.createdBy, 'createdBy');
}

/**
 * Validate tool create input
 * Throws validation errors if input is invalid.
 */
export function validateToolInput(input: {
  name?: string;
  scopeType?: ScopeType;
  scopeId?: string | null;
  category?: string | null;
  description?: string | null;
  constraints?: string | null;
  createdBy?: string | null;
}): void {
  validateRequiredString(input.name, 'name');
  validateScope(input.scopeType || 'global', input.scopeId);
  validateCategory(input.category);
  validateOptionalString(input.description, 'description');
  validateOptionalString(input.constraints, 'constraints');
  validateOptionalString(input.createdBy, 'createdBy');
}
