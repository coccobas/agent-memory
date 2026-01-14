/**
 * Zod Schema Builder
 *
 * Builds Zod validation schemas from the config registry.
 * Enables runtime validation with clear error messages.
 * Provides registry-driven config building.
 */

import { z } from 'zod';
import type { ConfigRegistry, ConfigSectionMeta, ConfigOptionMeta, ParserType } from './types.js';
import {
  parseBoolean,
  parseNumber,
  parseInt_,
  parsePort,
  parseString,
  resolveDataPath,
} from './parsers.js';
import { createValidationError } from '../../core/errors.js';

// =============================================================================
// SCHEMA BUILDING
// =============================================================================

/**
 * Build a Zod object schema for a single section
 */
export function buildSectionSchema(
  section: ConfigSectionMeta
): z.ZodObject<Record<string, z.ZodType>> {
  const shape: Record<string, z.ZodType> = {};

  for (const [key, option] of Object.entries(section.options)) {
    shape[key] = option.schema;
  }

  return z.object(shape);
}

/**
 * Build a complete Zod schema from the config registry
 */
export function buildConfigSchema(
  registry: ConfigRegistry
): z.ZodObject<Record<string, z.ZodType>> {
  const shape: Record<string, z.ZodType> = {};

  // Add top-level options
  for (const [key, option] of Object.entries(registry.topLevel)) {
    shape[key] = option.schema;
  }

  // Add sections
  for (const [key, section] of Object.entries(registry.sections)) {
    shape[key] = buildSectionSchema(section);
  }

  return z.object(shape);
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Format Zod validation errors into human-readable messages
 */
export function formatZodErrors(error: z.ZodError): string[] {
  return error.issues.map((err) => {
    const path = err.path.map(String).join('.');
    return `${path}: ${err.message}`;
  });
}

/**
 * Validate a config object against the registry schema.
 * Returns the validated config or throws with clear error messages.
 */
export function validateConfig<T>(
  config: unknown,
  schema: z.ZodType<T>,
  options?: { strict?: boolean }
): T {
  const result = schema.safeParse(config);

  if (!result.success) {
    const errors = formatZodErrors(result.error);
    const errorMessage = `Configuration validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`;

    if (options?.strict !== false) {
      throw createValidationError('config', errorMessage);
    }

    // In non-strict mode, log warning and continue
    console.warn(errorMessage);
    return config as T;
  }

  return result.data;
}

// =============================================================================
// DOCUMENTATION HELPERS
// =============================================================================

/**
 * Get a human-readable type string from a Zod schema.
 * Uses string matching on constructor name for Zod v4 compatibility.
 */
export function getZodTypeString(schema: z.ZodType): string {
  const constructorName = schema.constructor.name;

  if (constructorName === 'ZodString' || constructorName === '$ZodString') return 'string';
  if (constructorName === 'ZodNumber' || constructorName === '$ZodNumber') return 'number';
  if (constructorName === 'ZodBoolean' || constructorName === '$ZodBoolean') return 'boolean';
  if (constructorName === 'ZodObject' || constructorName === '$ZodObject') return 'object';

  if (constructorName === 'ZodEnum' || constructorName === '$ZodEnum') {
    // Try to extract enum values
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const def = (schema as any)._def;
      if (def?.values) {
        return def.values.map((v: string) => `\`${v}\``).join(' | ');
      }
    } catch {
      // Fallback
    }
    return 'enum';
  }

  if (constructorName === 'ZodOptional' || constructorName === '$ZodOptional') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const def = (schema as any)._def;
      if (def?.innerType) {
        return `${getZodTypeString(def.innerType)} (optional)`;
      }
    } catch {
      // Fallback
    }
    return 'optional';
  }

  return 'unknown';
}

/**
 * Get all environment variables from the registry
 */
export function getAllEnvVars(registry: ConfigRegistry): Array<{
  envKey: string;
  description: string;
  defaultValue: unknown;
  type: string;
  sensitive: boolean;
  section: string;
}> {
  const envVars: Array<{
    envKey: string;
    description: string;
    defaultValue: unknown;
    type: string;
    sensitive: boolean;
    section: string;
  }> = [];

  // Top-level options
  for (const [, option] of Object.entries(registry.topLevel)) {
    envVars.push({
      envKey: option.envKey,
      description: option.description,
      defaultValue: option.defaultValue,
      type: getZodTypeString(option.schema),
      sensitive: option.sensitive ?? false,
      section: '(top-level)',
    });
  }

  // Section options
  for (const [sectionKey, section] of Object.entries(registry.sections)) {
    for (const [, option] of Object.entries(section.options)) {
      envVars.push({
        envKey: option.envKey,
        description: option.description,
        defaultValue: option.defaultValue,
        type: getZodTypeString(option.schema),
        sensitive: option.sensitive ?? false,
        section: sectionKey,
      });
    }
  }

  return envVars;
}

// =============================================================================
// CONFIG BUILDING FROM REGISTRY
// =============================================================================

/**
 * Infer parser type from Zod schema when not explicitly specified
 */
function inferParserFromSchema(schema: z.ZodType): ParserType {
  const name = schema.constructor.name;

  if (name === 'ZodBoolean' || name === '$ZodBoolean') return 'boolean';
  if (name === 'ZodNumber' || name === '$ZodNumber') return 'number';
  if (name === 'ZodString' || name === '$ZodString') return 'string';
  if (name === 'ZodEnum' || name === '$ZodEnum') return 'string';

  // Check for optional wrapper
  if (name === 'ZodOptional' || name === '$ZodOptional') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inner = (schema as any)._def?.innerType;
      if (inner) return inferParserFromSchema(inner);
    } catch {
      // Fallback
    }
  }

  return 'string';
}

/**
 * Parse an environment variable value using the specified parser
 */
function parseEnvValue<T>(option: ConfigOptionMeta<T>, envValue: string | undefined): T {
  const defaultValue = option.defaultValue;

  // If custom parser function is provided, use it
  if (typeof option.parse === 'function') {
    return option.parse(envValue, defaultValue);
  }

  // Determine parser type
  const parserType: ParserType = option.parse ?? inferParserFromSchema(option.schema);

  // Handle path parser specially - needs to resolve default values too
  if (parserType === 'path') {
    return resolveDataPath(envValue, defaultValue as string) as T;
  }

  // Handle undefined/empty env value for other parsers
  if (envValue === undefined || envValue === '') {
    return defaultValue;
  }

  switch (parserType) {
    case 'boolean':
      return parseBoolean(envValue, defaultValue as boolean) as T;

    case 'number':
      return parseNumber(envValue, defaultValue as number) as T;

    case 'int':
      return parseInt_(envValue, defaultValue as number) as T;

    case 'port':
      return parsePort(envValue, defaultValue as number) as T;

    case 'string':
      if (option.allowedValues) {
        return parseString(
          envValue,
          defaultValue as string,
          option.allowedValues as readonly string[]
        ) as T;
      }
      return envValue as T;

    case 'stringArray':
      return envValue.split(',').map((s) => s.trim()) as T;

    default:
      return envValue as T;
  }
}

/**
 * Build a config section from registry metadata
 */
function buildSectionFromRegistry(section: ConfigSectionMeta): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, option] of Object.entries(section.options)) {
    const envValue = process.env[option.envKey];
    result[key] = parseEnvValue(option, envValue);
  }

  return result;
}

/**
 * Build complete config from registry metadata.
 * This is the single source of truth - no manual env var reading needed.
 */
export function buildConfigFromRegistry(registry: ConfigRegistry): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Build top-level options
  for (const [key, option] of Object.entries(registry.topLevel)) {
    const envValue = process.env[option.envKey];
    result[key] = parseEnvValue(option, envValue);
  }

  // Build sections
  for (const [key, section] of Object.entries(registry.sections)) {
    result[key] = buildSectionFromRegistry(section);
  }

  return result;
}
