/**
 * Config Registry Type Definitions
 *
 * Provides metadata-driven configuration with Zod validation.
 * Each config option declares envKey, default, description, schema, and parser.
 */

import type { z } from 'zod';

// =============================================================================
// PARSER TYPES
// =============================================================================

/**
 * Built-in parser types for common env var conversions
 */
export type ParserType =
  | 'string' // Direct string value
  | 'boolean' // '1', 'true' -> true
  | 'number' // parseFloat
  | 'int' // parseInt
  | 'port' // parseInt with 1-65535 validation
  | 'path' // Resolve relative to data dir
  | 'stringArray'; // CSV parsing

/**
 * Custom parser function type
 */
export type CustomParser<T> = (envValue: string | undefined, defaultValue: T) => T;

// =============================================================================
// CONFIG OPTION TYPES
// =============================================================================

/**
 * Metadata for a single configuration option
 */
export interface ConfigOptionMeta<T = unknown> {
  /** Environment variable key (e.g., 'AGENT_MEMORY_DB_PATH') */
  envKey: string;

  /** Default value when env var is not set */
  defaultValue: T;

  /** Description for documentation */
  description: string;

  /** Zod schema for validation */
  schema: z.ZodType<T>;

  /** Parser type or custom parser function */
  parse?: ParserType | CustomParser<T>;

  /** Allowed values for string enums (used with 'string' parser) */
  allowedValues?: readonly string[];

  /** Whether this is a sensitive value (passwords, keys) - hidden in docs */
  sensitive?: boolean;

  /** Deprecation notice */
  deprecated?: string;

  /** Related env vars */
  seeAlso?: string[];

  /** Example values for documentation */
  examples?: T[];

  /** Category for grouping in docs (overrides section) */
  category?: string;
}

// =============================================================================
// CONFIG SECTION TYPES
// =============================================================================

/**
 * Metadata for a configuration section (group of related options)
 */
export interface ConfigSectionMeta {
  /** Section name (e.g., 'database', 'postgresql') */
  name: string;

  /** Section description for documentation */
  description: string;

  /** Options in this section, keyed by config property name */
  options: Record<string, ConfigOptionMeta>;
}

// =============================================================================
// CONFIG REGISTRY TYPE
// =============================================================================

/**
 * Complete registry of all configuration options
 */
export interface ConfigRegistry {
  /** Top-level options (e.g., dbType) */
  topLevel: Record<string, ConfigOptionMeta>;

  /** Nested sections (e.g., database, postgresql, cache) */
  sections: Record<string, ConfigSectionMeta>;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Extract the value type from a ConfigOptionMeta
 */
export type OptionValue<T extends ConfigOptionMeta> = T['defaultValue'];

/**
 * Extract config shape from a section
 */
export type SectionConfig<T extends ConfigSectionMeta> = {
  [K in keyof T['options']]: OptionValue<T['options'][K]>;
};
