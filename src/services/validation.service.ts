/**
 * Validation service for entry validation rules
 *
 * Validation rules are stored as guidelines with category: 'validation'.
 * Rules are applied before create/update operations.
 */

import type { IGuidelineRepository } from '../core/interfaces/repositories.js';
import type { GuidelineWithVersion } from '../db/repositories/guidelines.js';
import type { ScopeType, EntryType } from '../db/schema.js';
import { createComponentLogger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { createSizeLimitError, createValidationError } from '../core/errors.js';
import { LRUCache } from '../utils/lru-cache.js';

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

  // Security limits
  REGEX_PATTERN_MAX_LENGTH: config.validation.regexPatternMaxLength,
  VALIDATION_RULES_QUERY_LIMIT: config.validation.validationRulesQueryLimit,
} as const;

// Convenience aliases
const MAX_NAME_LENGTH = SIZE_LIMITS.NAME_MAX_LENGTH;
const MAX_DESCRIPTION_LENGTH = SIZE_LIMITS.DESCRIPTION_MAX_LENGTH;
const MAX_CONTENT_LENGTH = SIZE_LIMITS.CONTENT_MAX_LENGTH;

// Maximum length for regex patterns to prevent DoS (from config)
const MAX_REGEX_PATTERN_LENGTH = config.validation.regexPatternMaxLength;

// =============================================================================
// BUILT-IN VALIDATION HELPERS
// =============================================================================

/**
 * Validate tool entry fields
 */
function validateToolEntry(data: Record<string, unknown>, errors: ValidationError[]): void {
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

  if (data.description && typeof data.description === 'string') {
    if (data.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push({
        field: 'description',
        rule: 'builtin:maxLength',
        message: `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters`,
      });
    }
  }
}

/**
 * Validate guideline entry fields
 */
function validateGuidelineEntry(data: Record<string, unknown>, errors: ValidationError[]): void {
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
}

/**
 * Validate knowledge entry fields
 */
function validateKnowledgeEntry(data: Record<string, unknown>, errors: ValidationError[]): void {
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

/**
 * Validate date fields are valid ISO dates within acceptable range
 */
function validateDateFields(data: Record<string, unknown>, errors: ValidationError[]): void {
  const dateFields = ['validUntil', 'createdAfter', 'createdBefore', 'updatedAfter', 'updatedBefore'];

  for (const field of dateFields) {
    if (data[field] !== undefined && data[field] !== null) {
      const dateValue = data[field];
      if (typeof dateValue === 'string') {
        try {
          validateDateRange(dateValue, field);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : `${field} is invalid`;
          errors.push({
            field,
            rule: 'builtin:dateRange',
            message: errorMessage,
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
}

/**
 * Validate JSON metadata fields are valid
 */
function validateJsonFields(data: Record<string, unknown>, errors: ValidationError[]): void {
  const metadataFields = ['metadata', 'parameters', 'examples'];

  for (const field of metadataFields) {
    if (data[field] !== undefined && data[field] !== null) {
      const value = data[field];
      if (typeof value === 'string') {
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
}

/**
 * Check if a regex pattern is safe (no ReDoS potential).
 * Rejects patterns with nested quantifiers that could cause exponential backtracking.
 *
 * Security: Prevents Regular Expression Denial of Service attacks.
 */
function isSafeRegexPattern(pattern: string): boolean {
  // Check length first
  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    return false;
  }

  return detectRedosPatterns(pattern);
}

/**
 * Detect common ReDoS vulnerability patterns in regex.
 * Returns true if pattern is SAFE, false if DANGEROUS.
 *
 * This is a defense-in-depth approach focusing on practical patterns that
 * commonly cause DoS. It does not provide complete ReDoS prevention
 * (which is computationally hard) but catches common attack patterns.
 *
 * @param pattern - The regex pattern to validate
 * @returns true if pattern appears safe, false if potentially dangerous
 */
export function detectRedosPatterns(pattern: string): boolean {
  // Detect dangerous patterns: nested quantifiers that cause catastrophic backtracking
  const dangerousPatterns = [
    // === NESTED QUANTIFIERS ===
    // These cause exponential backtracking: (a+)+, (a*)+, (a?)*, (a?)+
    /\([^)]*[+*?]\)[+*?]/,

    // Quantified groups with trailing quantifier: (x){2,}+, (a)*{1,5}, (test)+{2,}
    /\([^)]*\)[+*?]?\{/,

    // Multiple consecutive quantifiers (ignoring lazy modifiers)
    // Check for: +++, ***, ???, but also ++*, *+?, etc.
    // First remove lazy modifiers (?) that follow quantifiers, then check for duplicates
    /[+*][+*]/,

    // Character class with quantifier and brace: [a-z]+{, [0-9]*{2,}
    /\[[^\]]*\][+*?]\{/,

    // === OVERLAPPING ALTERNATIONS ===
    // Patterns like (a|a)+, (ab|a)+, (a|ab)* that cause backtracking
    // Simplified check: alternation with quantifier that might overlap
    /\([^)]*\|[^)]*\)[+*]/,

    // === EXPONENTIAL BACKTRACKING PATTERNS ===
    // Nested quantifiers with optional elements: (a+b?)+ causes exponential growth
    // Pattern: quantified group containing quantified element followed by optional element
    /\([^)]*[+*][^)]*[?]\)[+*]/,

    // Pattern with multiple quantifiers: (a*b*)+
    /\([^)]*[+*?][^)]*[+*?]\)[+*]/,

    // === CATASTROPHIC PATTERNS WITH REPETITION ===
    // Greedy quantifiers on both sides: .*.*+, .+.++, .*x.*+
    /\.\*[^)]*\.\*[+*]/,
    /\.\+[^)]*\.\+[+*]/,

    // Pattern: (x+x+)+ - repeated elements with quantifiers
    /\([^)]*[+*][^)]*[+*]\)\+/,

    // === ALTERNATION WITH NESTED QUANTIFIERS ===
    // Complex alternations that can cause backtracking: (a+|b+)+, (x*|y*)*
    /\([^)]*[+*]\|[^)]*[+*]\)[+*]/,

    // === EXCESSIVE REPETITION BOUNDS ===
    // Very large repetition counts: .{1,99999}, a{100,}, [a-z]{1,10000}
    // This checks for bounds >= 1000
    /\{[^}]*,\s*([1-9]\d{3,}|[1-9]\d\d\d+)\}/,
    /\{\s*([1-9]\d{3,}|[1-9]\d\d\d+)\s*,/,

    // === WORD BOUNDARIES WITH GREEDY QUANTIFIERS ===
    // Patterns like \b.*\b that can cause excessive backtracking
    /\\b[^)]*\.\*[^)]*\\b/,
    /\\b[^)]*\.\+[^)]*\\b/,
  ];

  for (const dangerous of dangerousPatterns) {
    if (dangerous.test(pattern)) {
      return false;
    }
  }

  return true;
}

/**
 * Validate text field length
 */
export function validateTextLength(
  value: string | undefined | null,
  fieldName: string,
  maxLength: number
): void {
  if (value && value.length > maxLength) {
    throw createSizeLimitError(fieldName, maxLength, value.length, 'characters');
  }
}

/**
 * Validate JSON field size
 */
export function validateJsonSize(value: unknown, fieldName: string, maxBytes: number): void {
  if (value === undefined || value === null) return;

  const serialized = JSON.stringify(value);
  if (serialized.length > maxBytes) {
    throw createSizeLimitError(fieldName, maxBytes, serialized.length, 'bytes');
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
    throw createSizeLimitError(fieldName, maxCount, value.length, 'items');
  }
}

/**
 * Date range validation constants
 */
export const DATE_RANGE = {
  MIN_YEAR: 1970,
  MAX_YEAR: 2100,
} as const;

/**
 * Validate date is within reasonable range (1970-2100)
 *
 * Prevents obviously invalid dates like year 0001 or 9999 while allowing
 * legitimate historical dates (Unix epoch forward) and reasonable future dates.
 *
 * @param date - ISO date string to validate
 * @param fieldName - Name of the field for error messages
 * @returns The validated date string
 * @throws Error if date is invalid or outside the acceptable range
 */
export function validateDateRange(date: string, fieldName: string): string {
  // Parse the date
  const parsedDate = new Date(date);

  // Check if date is valid
  if (isNaN(parsedDate.getTime())) {
    throw createValidationError(fieldName, 'must be a valid ISO 8601 date string', 'Use format like 2024-01-15 or 2024-01-15T10:30:00Z');
  }

  // Extract year
  const year = parsedDate.getUTCFullYear();

  // Validate year is within acceptable range
  if (year < DATE_RANGE.MIN_YEAR) {
    throw createValidationError(fieldName, `year must be ${DATE_RANGE.MIN_YEAR} or later (got ${year})`, `Use a date from ${DATE_RANGE.MIN_YEAR} onwards`);
  }

  if (year > DATE_RANGE.MAX_YEAR) {
    throw createValidationError(fieldName, `year must be ${DATE_RANGE.MAX_YEAR} or earlier (got ${year})`, `Use a date before ${DATE_RANGE.MAX_YEAR}`);
  }

  // Return the original date string if valid
  return date;
}

/**
 * Validation service interface
 */
export interface ValidationService {
  validateEntry(
    entryType: EntryType,
    data: Record<string, unknown>,
    scopeType: ScopeType,
    scopeId?: string
  ): Promise<ValidationResult>;

  /**
   * Invalidate the cached validation rules.
   * Call this when validation guidelines are updated.
   */
  invalidateCache(): void;
}

/**
 * Create a validation service with injected dependencies
 *
 * @param guidelineRepo - Guideline repository for loading validation rules
 * @returns Validation service instance
 */
export function createValidationService(guidelineRepo: IGuidelineRepository): ValidationService {
  // Cache for validation rules with TTL (5 minutes by default)
  const validationRulesCache = new LRUCache<GuidelineWithVersion[]>({
    maxSize: 1, // Only one entry needed (all validation rules)
    ttlMs: config.cache.queryCacheTTLMs,
  });

  return {
    async validateEntry(
      entryType: EntryType,
      data: Record<string, unknown>,
      _scopeType: ScopeType,
      _scopeId?: string
    ): Promise<ValidationResult> {
      return validateEntryImpl(guidelineRepo, validationRulesCache, entryType, data, _scopeType, _scopeId);
    },

    invalidateCache(): void {
      validationRulesCache.clear();
      logger.debug('Validation rules cache invalidated');
    },
  };
}

/**
 * Validate an entry against validation rules (implementation)
 *
 * @param guidelineRepo - Guideline repository
 * @param cache - LRU cache for validation rules
 * @param entryType - Type of entry to validate
 * @param data - Entry data to validate
 * @param scopeType - Scope type
 * @param scopeId - Scope ID (optional)
 * @returns Validation result with errors if any
 */
async function validateEntryImpl(
  guidelineRepo: IGuidelineRepository,
  cache: LRUCache<GuidelineWithVersion[]>,
  entryType: EntryType,
  data: Record<string, unknown>,
  _scopeType: ScopeType,
  _scopeId?: string
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];

  // Check cache first for validation rules
  const cacheKey = 'validation-rules';
  let validationRules = cache.get(cacheKey);

  if (!validationRules) {
    // Load validation rules from guidelines
    validationRules = await guidelineRepo.list(
      {
        category: 'validation',
        includeInactive: false,
      },
      { limit: config.validation.validationRulesQueryLimit }
    );
    cache.set(cacheKey, validationRules);
    logger.debug({ ruleCount: validationRules.length }, 'Loaded and cached validation rules');
  }

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

          // Pattern check (regex) with ReDoS protection
          if (ruleConfig.pattern) {
            // Security: Validate pattern before creating RegExp to prevent ReDoS
            if (!isSafeRegexPattern(ruleConfig.pattern)) {
              logger.warn(
                { pattern: ruleConfig.pattern, rule: rule.name },
                'Rejected potentially dangerous regex pattern (ReDoS risk)'
              );
              // Skip unsafe patterns - don't validate with them
            } else {
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

  // Built-in validation rules by entry type
  if (entryType === 'tool') {
    validateToolEntry(data, errors);
  } else if (entryType === 'guideline') {
    validateGuidelineEntry(data, errors);
  } else if (entryType === 'knowledge') {
    validateKnowledgeEntry(data, errors);
  }

  // Validate date formats and ranges
  validateDateFields(data, errors);

  // Validate JSON metadata fields
  validateJsonFields(data, errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}



