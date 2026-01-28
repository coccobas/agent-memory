/**
 * Notion Sync Configuration Schema and Validation
 *
 * Provides TypeScript interfaces and Zod validation for Notion sync configuration.
 * Supports mapping Notion database properties to Agent Memory task fields.
 */

import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { createValidationError } from '../../core/errors.js';

// =============================================================================
// SUPPORTED TYPES
// =============================================================================

/**
 * Supported Notion property types for field mapping.
 * Limited to common types that can be reliably converted to task fields.
 */
export const SUPPORTED_NOTION_TYPES = [
  'title',
  'rich_text',
  'number',
  'select',
  'multi_select',
  'date',
  'checkbox',
  'status',
] as const;

export type NotionPropertyType = (typeof SUPPORTED_NOTION_TYPES)[number];

/**
 * Task fields that can be mapped from Notion properties.
 */
export const TASK_FIELDS = [
  'title',
  'description',
  'status',
  'resolution',
  'category',
  'dueDate',
  'assignee',
  'tags',
] as const;

export type TaskField = (typeof TASK_FIELDS)[number];

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

/**
 * Schema for a single field mapping between Notion property and task field.
 */
const fieldMappingSchema = z.object({
  /** Name of the Notion property to map from */
  notionProperty: z.string().min(1, 'Notion property name is required'),
  /** Target task field to map to */
  taskField: z.enum(TASK_FIELDS),
  /** Optional type hint for the Notion property (auto-detected if not provided) */
  notionType: z.enum(SUPPORTED_NOTION_TYPES).optional(),
});

export type FieldMapping = z.infer<typeof fieldMappingSchema>;

/**
 * Regex pattern for validating Notion database IDs.
 * Notion IDs are 32-character hex strings, optionally with hyphens.
 */
const NOTION_DATABASE_ID_PATTERN =
  /^[a-f0-9]{8}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{12}$/i;

/**
 * Schema for a single database configuration.
 */
const databaseConfigSchema = z.object({
  /** Notion database UUID */
  notionDatabaseId: z
    .string()
    .regex(
      NOTION_DATABASE_ID_PATTERN,
      'Invalid Notion database ID format. Expected 32-character hex UUID.'
    ),
  /** Agent Memory project ID to sync tasks to */
  projectScopeId: z.string().min(1, 'Project scope ID is required'),
  /** Whether sync is enabled for this database */
  syncEnabled: z.boolean().default(true),
  /** Mappings from Notion properties to task fields */
  fieldMappings: z.array(fieldMappingSchema).min(1, 'At least one field mapping is required'),
  /** ISO timestamp of last successful sync (managed by sync service) */
  lastSyncTimestamp: z.string().datetime().optional(),
});

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;

/**
 * Schema for the complete Notion sync configuration.
 */
const notionSyncConfigSchema = z.object({
  /** Array of database configurations */
  databases: z
    .array(databaseConfigSchema)
    .min(1, 'At least one database configuration is required'),
});

export type NotionSyncConfig = z.infer<typeof notionSyncConfigSchema>;

// =============================================================================
// CONFIG FILE HANDLING
// =============================================================================

/** Default config file name */
const CONFIG_FILE_NAME = 'notion-sync.config.json';

/**
 * Load and validate Notion sync configuration from a JSON file.
 *
 * @param configPath - Optional path to config file. Defaults to notion-sync.config.json in cwd.
 * @returns Validated NotionSyncConfig object
 * @throws AgentMemoryError if file not found, invalid JSON, or validation fails
 *
 * @example
 * ```typescript
 * // Load from default location
 * const config = loadNotionSyncConfig();
 *
 * // Load from custom path
 * const config = loadNotionSyncConfig('/path/to/config.json');
 * ```
 */
export function loadNotionSyncConfig(configPath?: string): NotionSyncConfig {
  const filePath = configPath ?? path.join(process.cwd(), CONFIG_FILE_NAME);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    throw createValidationError(
      'config',
      `Config file not found: ${filePath}`,
      `Create ${CONFIG_FILE_NAME} with database configurations`
    );
  }

  // Read and parse JSON
  let rawConfig: unknown;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    rawConfig = JSON.parse(content);
  } catch (error) {
    throw createValidationError(
      'config',
      `Failed to parse config file: ${error instanceof Error ? error.message : String(error)}`,
      'Ensure the config file contains valid JSON'
    );
  }

  // Validate against schema
  const result = notionSyncConfigSchema.safeParse(rawConfig);
  if (!result.success) {
    const errors = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw createValidationError(
      'config',
      `Invalid config: ${errors}`,
      'Check the config file against the schema'
    );
  }

  return result.data;
}

/**
 * Validate a single database configuration object.
 *
 * @param config - Raw database config object to validate
 * @returns Validated DatabaseConfig object
 * @throws AgentMemoryError if validation fails
 *
 * @example
 * ```typescript
 * const dbConfig = validateDatabaseConfig({
 *   notionDatabaseId: 'abc123...',
 *   projectScopeId: 'proj-123',
 *   fieldMappings: [{ notionProperty: 'Name', taskField: 'title' }]
 * });
 * ```
 */
export function validateDatabaseConfig(config: unknown): DatabaseConfig {
  const result = databaseConfigSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw createValidationError('databaseConfig', `Invalid database config: ${errors}`);
  }
  return result.data;
}

/**
 * Check if a Notion property type is supported for field mapping.
 *
 * @param type - Property type string to check
 * @returns True if the type is supported
 *
 * @example
 * ```typescript
 * if (isSupportedNotionType('rich_text')) {
 *   // Handle rich_text property
 * }
 * ```
 */
export function isSupportedNotionType(type: string): type is NotionPropertyType {
  return SUPPORTED_NOTION_TYPES.includes(type as NotionPropertyType);
}

/**
 * Validate a field mapping object.
 *
 * @param mapping - Raw field mapping object to validate
 * @returns Validated FieldMapping object
 * @throws AgentMemoryError if validation fails
 */
export function validateFieldMapping(mapping: unknown): FieldMapping {
  const result = fieldMappingSchema.safeParse(mapping);
  if (!result.success) {
    const errors = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw createValidationError('fieldMapping', `Invalid field mapping: ${errors}`);
  }
  return result.data;
}

// =============================================================================
// SCHEMA EXPORTS (for external validation)
// =============================================================================

export { notionSyncConfigSchema, databaseConfigSchema, fieldMappingSchema };
