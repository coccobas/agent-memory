/**
 * Type guard utilities for runtime type validation
 *
 * Provides type-safe parameter validation to replace unsafe type casting.
 * These functions validate at runtime and provide better error messages.
 */

/**
 * Type guard to check if a value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard to check if a value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * Type guard to check if a value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Type guard to check if a value is an object (not null, not array)
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard to check if a value is an array
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Type guard to check if a value is a valid scope type
 */
export function isScopeType(value: unknown): value is 'global' | 'org' | 'project' | 'session' {
  return isString(value) && ['global', 'org', 'project', 'session'].includes(value);
}

/**
 * Type guard to check if a value is a valid entry type
 */
export function isEntryType(value: unknown): value is 'tool' | 'guideline' | 'knowledge' {
  return isString(value) && ['tool', 'guideline', 'knowledge'].includes(value);
}

/**
 * Type guard to check if a value is a valid ISO date string
 */
export function isISODateString(value: unknown): value is string {
  if (!isString(value)) return false;
  const date = new Date(value);
  return !isNaN(date.getTime()) && value.includes('T');
}

/**
 * Validate and cast parameters with type checking
 *
 * @param params - Parameters to validate
 * @param validator - Function that validates the parameters
 * @returns Validated parameters
 * @throws Error if validation fails
 */
export function validateParams<T extends Record<string, unknown>>(
  params: Record<string, unknown>,
  validator: (params: Record<string, unknown>) => params is T
): T {
  if (!validator(params)) {
    throw new Error('Parameter validation failed');
  }
  return params;
}

/**
 * Safe parameter access with type checking
 *
 * @param params - Parameters object
 * @param key - Parameter key
 * @param typeGuard - Type guard function
 * @param defaultValue - Optional default value
 * @returns Validated value or default
 */
export function getParam<T>(
  params: Record<string, unknown>,
  key: string,
  typeGuard: (value: unknown) => value is T,
  defaultValue?: T
): T {
  const value = params[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Parameter '${key}' is required`);
  }
  if (!typeGuard(value)) {
    throw new Error(`Parameter '${key}' has invalid type`);
  }
  return value;
}

/**
 * Get optional parameter with type checking
 *
 * @param params - Parameters object
 * @param key - Parameter key
 * @param typeGuard - Type guard function
 * @returns Validated value or undefined
 */
export function getOptionalParam<T>(
  params: object,
  key: string,
  typeGuard: (value: unknown) => value is T
): T | undefined {
  const value = (params as Record<string, unknown>)[key];
  if (value === undefined) {
    return undefined;
  }
  if (!typeGuard(value)) {
    throw new Error(`Parameter '${key}' has invalid type`);
  }
  return value;
}

/**
 * Type guard to check if a value is a valid tool category
 */
export function isToolCategory(value: unknown): value is 'mcp' | 'cli' | 'function' | 'api' {
  return isString(value) && ['mcp', 'cli', 'function', 'api'].includes(value);
}

/**
 * Type guard to check if a value is an array of objects
 */
export function isArrayOfObjects(value: unknown): value is Array<Record<string, unknown>> {
  if (!isArray(value)) return false;
  return value.every((item) => isObject(item));
}

/**
 * Type guard to check if a value is an array of strings
 */
export function isArrayOfStrings(value: unknown): value is string[] {
  if (!isArray(value)) return false;
  return value.every((item) => isString(item));
}

/**
 * Type guard to check if a value is a guideline/knowledge examples object
 */
export function isExamplesObject(value: unknown): value is { bad?: string[]; good?: string[] } {
  if (!isObject(value)) return false;
  const obj = value;
  if (obj.bad !== undefined && !isArrayOfStrings(obj.bad)) return false;
  if (obj.good !== undefined && !isArrayOfStrings(obj.good)) return false;
  return true;
}

/**
 * Type guard to check if a value is a valid knowledge category
 */
export function isKnowledgeCategory(
  value: unknown
): value is 'decision' | 'fact' | 'context' | 'reference' {
  return isString(value) && ['decision', 'fact', 'context', 'reference'].includes(value);
}

/**
 * Type guard to check if a value is a valid tag category
 */
export function isTagCategory(
  value: unknown
): value is 'language' | 'domain' | 'category' | 'meta' | 'custom' {
  return isString(value) && ['language', 'domain', 'category', 'meta', 'custom'].includes(value);
}

/**
 * Type guard to check if a value is a valid relation type
 */
export function isRelationType(
  value: unknown
): value is
  | 'applies_to'
  | 'depends_on'
  | 'conflicts_with'
  | 'related_to'
  | 'parent_task'
  | 'subtask_of' {
  return (
    isString(value) &&
    [
      'applies_to',
      'depends_on',
      'conflicts_with',
      'related_to',
      'parent_task',
      'subtask_of',
    ].includes(value)
  );
}

/**
 * Type guard to check if a value is a valid permission level
 */
export function isPermissionLevel(value: unknown): value is 'read' | 'write' | 'admin' {
  return isString(value) && ['read', 'write', 'admin'].includes(value);
}

/**
 * Type guard to check if a value is a valid permission action
 */
export function isPermissionAction(value: unknown): value is 'read' | 'write' | 'delete' {
  return isString(value) && ['read', 'write', 'delete'].includes(value);
}

/**
 * Type guard to check if a value is a valid conversation role
 */
export function isConversationRole(value: unknown): value is 'user' | 'agent' | 'system' {
  return isString(value) && ['user', 'agent', 'system'].includes(value);
}

/**
 * Type guard to check if a value is a valid conversation status
 */
export function isConversationStatus(value: unknown): value is 'active' | 'completed' | 'archived' {
  return isString(value) && ['active', 'completed', 'archived'].includes(value);
}

/**
 * Get required parameter with type checking and custom error message
 * This version throws errors in the old format for backward compatibility
 *
 * @param params - Parameters object
 * @param key - Parameter key
 * @param typeGuard - Type guard function
 * @param customError - Optional custom error message (defaults to "{key} is required")
 * @returns Validated value
 */
export function getRequiredParam<T>(
  params: object,
  key: string,
  typeGuard: (value: unknown) => value is T,
  customError?: string
): T {
  const value = (params as Record<string, unknown>)[key];
  if (value === undefined) {
    throw new Error(customError || `${key} is required`);
  }
  if (!typeGuard(value)) {
    throw new Error(`${key} has invalid type`);
  }
  return value;
}

// =============================================================================
// NUMERIC VALIDATION TYPE GUARDS
// =============================================================================

/**
 * Type guard for valid limit parameter (1-1000, integer)
 */
export function isValidLimit(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 1 && value <= 1000;
}

/**
 * Type guard for valid offset parameter (non-negative integer)
 */
export function isValidOffset(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 0;
}

/**
 * Type guard for valid priority parameter (0-100, finite)
 */
export function isValidPriority(value: unknown): value is number {
  return isNumber(value) && Number.isFinite(value) && value >= 0 && value <= 100;
}

/**
 * Type guard for valid confidence/threshold parameter (0-1, finite)
 */
export function isValidConfidence(value: unknown): value is number {
  return isNumber(value) && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Type guard for positive integer (useful for counts, keepCount, etc.)
 */
export function isPositiveInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 1;
}

/**
 * Type guard for non-negative integer (useful for staleDays, etc.)
 */
export function isNonNegativeInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 0;
}


