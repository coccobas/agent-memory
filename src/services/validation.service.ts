/**
 * Validation service for entry validation rules
 *
 * Validation rules are stored as guidelines with category: 'validation'.
 * Rules are applied before create/update operations.
 */

import { guidelineRepo } from '../db/repositories/guidelines.js';
import type { ScopeType, EntryType } from '../db/schema.js';
import { createComponentLogger } from '../utils/logger.js';
import { config } from '../config/index.js';

const logger = createComponentLogger('validation');

export interface ValidationError {
  field: string;
  rule: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// Size limit constants from config
export const SIZE_LIMITS = {
  // Text field limits (characters)
  NAME_MAX_LENGTH: config.validation.nameMaxLength,
  TITLE_MAX_LENGTH: config.validation.titleMaxLength,
  DESCRIPTION_MAX_LENGTH: config.validation.descriptionMaxLength,
  CONTENT_MAX_LENGTH: config.validation.contentMaxLength,
  RATIONALE_MAX_LENGTH: config.validation.rationaleMaxLength,

  // JSON field limits (bytes when serialized)
  METADATA_MAX_BYTES: config.validation.metadataMaxBytes,
  PARAMETERS_MAX_BYTES: config.validation.parametersMaxBytes,
  EXAMPLES_MAX_BYTES: config.validation.examplesMaxBytes,

  // Array limits
  TAGS_MAX_COUNT: config.validation.tagsMaxCount,
  EXAMPLES_MAX_COUNT: config.validation.examplesMaxCount,
  BULK_OPERATION_MAX: config.validation.bulkOperationMax,
} as const;

// Legacy constants for backward compatibility
const MAX_NAME_LENGTH = SIZE_LIMITS.NAME_MAX_LENGTH;
const MAX_DESCRIPTION_LENGTH = SIZE_LIMITS.DESCRIPTION_MAX_LENGTH;
const MAX_CONTENT_LENGTH = SIZE_LIMITS.CONTENT_MAX_LENGTH;

/**
 * Validate text field length
 */
export function validateTextLength(
  value: string | undefined | null,
  fieldName: string,
  maxLength: number
): void {
  if (value && value.length > maxLength) {
    throw new Error(
      `${fieldName} exceeds maximum length of ${maxLength} characters (got ${value.length})`
    );
  }
}

/**
 * Validate JSON field size
 */
export function validateJsonSize(value: unknown, fieldName: string, maxBytes: number): void {
  if (value === undefined || value === null) return;

  const serialized = JSON.stringify(value);
  if (serialized.length > maxBytes) {
    throw new Error(
      `${fieldName} exceeds maximum size of ${maxBytes} bytes (got ${serialized.length})`
    );
  }
}

/**
 * Validate array length
 */
export function validateArrayLength(
  value: unknown[] | undefined | null,
  fieldName: string,
  maxCount: number
): void {
  if (value && value.length > maxCount) {
    throw new Error(
      `${fieldName} exceeds maximum count of ${maxCount} items (got ${value.length})`
    );
  }
}

/**
 * Validate an entry against validation rules
 *
 * @param entryType - Type of entry to validate
 * @param data - Entry data to validate
 * @param scopeType - Scope type
 * @param scopeId - Scope ID (optional)
 * @returns Validation result with errors if any
 */
export function validateEntry(
  entryType: EntryType,
  data: Record<string, unknown>,
  _scopeType: ScopeType,
  _scopeId?: string
): ValidationResult {
  const errors: ValidationError[] = [];

  // Load validation rules from guidelines
  const validationRules = guidelineRepo.list(
    {
      category: 'validation',
      includeInactive: false,
    },
    { limit: 1000 }
  );

  // Filter rules by entry type if specified in rule name or content
  const applicableRules = validationRules.filter((rule) => {
    const version = rule.currentVersion;
    if (!version) return false;

    // Check if rule applies to this entry type
    // Rules can specify entry type in name (e.g., "validation:tool:required_name")
    // or in content as JSON
    const ruleName = rule.name.toLowerCase();
    const ruleContent = version.content.toLowerCase();

    // Check if rule mentions this entry type
    const mentionsType =
      ruleName.includes(entryType) ||
      ruleContent.includes(entryType) ||
      ruleName.includes('all') ||
      ruleContent.includes('all');

    return mentionsType;
  });

  // Apply each validation rule
  for (const rule of applicableRules) {
    const version = rule.currentVersion;
    if (!version) continue;

    try {
      // Try to parse rule as JSON for structured rules
      let ruleConfig: {
        field?: string;
        type?: string;
        required?: boolean;
        minLength?: number;
        maxLength?: number;
        pattern?: string;
        message?: string;
      };

      try {
        ruleConfig = JSON.parse(version.content) as typeof ruleConfig;
      } catch {
        // If not JSON, treat as simple text rule
        ruleConfig = {
          message: version.content,
        };
      }

      // Apply rule based on configuration
      if (ruleConfig.field) {
        const fieldValue = data[ruleConfig.field];
        const fieldName = ruleConfig.field;

        // Required field check
        if (
          ruleConfig.required &&
          (fieldValue === undefined || fieldValue === null || fieldValue === '')
        ) {
          errors.push({
            field: fieldName,
            rule: rule.name,
            message: ruleConfig.message || `${fieldName} is required`,
          });
        }

        // Type check
        if (fieldValue !== undefined && fieldValue !== null && ruleConfig.type) {
          const actualType = typeof fieldValue;
          if (
            actualType !== ruleConfig.type &&
            !(ruleConfig.type === 'number' && typeof fieldValue === 'number')
          ) {
            errors.push({
              field: fieldName,
              rule: rule.name,
              message: ruleConfig.message || `${fieldName} must be of type ${ruleConfig.type}`,
            });
          }
        }

        // String length checks
        if (typeof fieldValue === 'string') {
          if (ruleConfig.minLength !== undefined && fieldValue.length < ruleConfig.minLength) {
            errors.push({
              field: fieldName,
              rule: rule.name,
              message:
                ruleConfig.message ||
                `${fieldName} must be at least ${ruleConfig.minLength} characters`,
            });
          }

          if (ruleConfig.maxLength !== undefined && fieldValue.length > ruleConfig.maxLength) {
            errors.push({
              field: fieldName,
              rule: rule.name,
              message:
                ruleConfig.message ||
                `${fieldName} must be at most ${ruleConfig.maxLength} characters`,
            });
          }

          // Pattern check (regex)
          if (ruleConfig.pattern) {
            try {
              const regex = new RegExp(ruleConfig.pattern);
              if (!regex.test(fieldValue)) {
                errors.push({
                  field: fieldName,
                  rule: rule.name,
                  message: ruleConfig.message || `${fieldName} does not match required pattern`,
                });
              }
            } catch {
              // Invalid regex pattern, skip
            }
          }
        }
      } else {
        // Generic rule - check if content matches any pattern
        // This is a simple implementation - can be enhanced
        const ruleContent = version.content;
        if (ruleContent.includes('required') && Object.keys(data).length === 0) {
          errors.push({
            field: 'entry',
            rule: rule.name,
            message: ruleConfig.message || 'Entry data is required',
          });
        }
      }
    } catch (error) {
      // Skip invalid rules
      if (config.logging.performance) {
        logger.error({ ruleName: rule.name, error }, 'Error applying validation rule');
      }
    }
  }

  // Built-in validation rules
  // Required fields and length constraints by entry type
  if (entryType === 'tool') {
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      errors.push({
        field: 'name',
        rule: 'builtin:required',
        message: 'Tool name is required',
      });
    } else if (data.name.length > MAX_NAME_LENGTH) {
      errors.push({
        field: 'name',
        rule: 'builtin:maxLength',
        message: `Tool name must be at most ${MAX_NAME_LENGTH} characters`,
      });
    }

    // Validate description length
    if (data.description && typeof data.description === 'string') {
      if (data.description.length > MAX_DESCRIPTION_LENGTH) {
        errors.push({
          field: 'description',
          rule: 'builtin:maxLength',
          message: `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters`,
        });
      }
    }
  } else if (entryType === 'guideline') {
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      errors.push({
        field: 'name',
        rule: 'builtin:required',
        message: 'Guideline name is required',
      });
    } else if (data.name.length > MAX_NAME_LENGTH) {
      errors.push({
        field: 'name',
        rule: 'builtin:maxLength',
        message: `Guideline name must be at most ${MAX_NAME_LENGTH} characters`,
      });
    }

    if (!data.content || typeof data.content !== 'string' || data.content.trim().length === 0) {
      errors.push({
        field: 'content',
        rule: 'builtin:required',
        message: 'Guideline content is required',
      });
    } else if (data.content.length > MAX_CONTENT_LENGTH) {
      errors.push({
        field: 'content',
        rule: 'builtin:maxLength',
        message: `Content must be at most ${MAX_CONTENT_LENGTH} characters`,
      });
    }
  } else if (entryType === 'knowledge') {
    if (!data.title || typeof data.title !== 'string' || data.title.trim().length === 0) {
      errors.push({
        field: 'title',
        rule: 'builtin:required',
        message: 'Knowledge title is required',
      });
    } else if (data.title.length > MAX_NAME_LENGTH) {
      errors.push({
        field: 'title',
        rule: 'builtin:maxLength',
        message: `Title must be at most ${MAX_NAME_LENGTH} characters`,
      });
    }

    if (!data.content || typeof data.content !== 'string' || data.content.trim().length === 0) {
      errors.push({
        field: 'content',
        rule: 'builtin:required',
        message: 'Knowledge content is required',
      });
    } else if (data.content.length > MAX_CONTENT_LENGTH) {
      errors.push({
        field: 'content',
        rule: 'builtin:maxLength',
        message: `Content must be at most ${MAX_CONTENT_LENGTH} characters`,
      });
    }
  }

  // Validate date formats
  const dateFields = [
    'validUntil',
    'createdAfter',
    'createdBefore',
    'updatedAfter',
    'updatedBefore',
  ];
  for (const field of dateFields) {
    if (data[field] !== undefined && data[field] !== null) {
      const dateValue = data[field];
      if (typeof dateValue === 'string') {
        const date = new Date(dateValue);
        if (isNaN(date.getTime())) {
          errors.push({
            field,
            rule: 'builtin:dateFormat',
            message: `${field} must be a valid ISO 8601 date string`,
          });
        }
      } else {
        errors.push({
          field,
          rule: 'builtin:dateType',
          message: `${field} must be a string`,
        });
      }
    }
  }

  // Validate JSON metadata fields
  const metadataFields = ['metadata', 'parameters', 'examples'];
  for (const field of metadataFields) {
    if (data[field] !== undefined && data[field] !== null) {
      const value = data[field];
      if (typeof value === 'string') {
        // Try to parse as JSON
        try {
          JSON.parse(value);
        } catch {
          errors.push({
            field,
            rule: 'builtin:jsonFormat',
            message: `${field} must be valid JSON`,
          });
        }
      } else if (typeof value !== 'object' || Array.isArray(value)) {
        // If not a string, it should be an object (not array)
        if (field === 'metadata' && Array.isArray(value)) {
          errors.push({
            field,
            rule: 'builtin:jsonType',
            message: `${field} must be an object, not an array`,
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

