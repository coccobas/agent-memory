/**
 * Validation service for entry validation rules
 *
 * Validation rules are stored as guidelines with category: 'validation'.
 * Rules are applied before create/update operations.
 */

import { guidelineRepo } from '../db/repositories/guidelines.js';
import type { ScopeType, EntryType } from '../db/schema.js';
import { createComponentLogger } from '../utils/logger.js';

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

// Validation constants
const MAX_NAME_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 10 * 1024; // 10KB
const MAX_CONTENT_LENGTH = 1024 * 1024; // 1MB

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
      // eslint-disable-next-line no-console
      if (process.env.AGENT_MEMORY_PERF === '1') {
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

