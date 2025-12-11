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
  params: Record<string, unknown>,
  key: string,
  typeGuard: (value: unknown) => value is T
): T | undefined {
  const value = params[key];
  if (value === undefined) {
    return undefined;
  }
  if (!typeGuard(value)) {
    throw new Error(`Parameter '${key}' has invalid type`);
  }
  return value;
}


