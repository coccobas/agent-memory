/**
 * Query Pipeline Type Mappings
 *
 * Centralized type conversion between QueryType (plural API level)
 * and QueryEntryType (singular database level).
 *
 * Consolidates 11+ scattered type mapping patterns into one source of truth.
 */

import type { QueryType, QueryEntryType, EntryUnion } from './types.js';
import { tools, guidelines, knowledge, experiences } from '../../db/schema.js';

// =============================================================================
// TYPE CONVERSION MAPS
// =============================================================================

/**
 * Mapping from plural API type to singular DB type.
 * e.g., 'tools' -> 'tool'
 */
export const QUERY_TYPE_TO_ENTRY_TYPE: Record<QueryType, QueryEntryType> = {
  tools: 'tool',
  guidelines: 'guideline',
  knowledge: 'knowledge',
  experiences: 'experience',
} as const;

/**
 * Mapping from singular DB type to plural API type.
 * e.g., 'tool' -> 'tools'
 */
export const ENTRY_TYPE_TO_QUERY_TYPE: Record<QueryEntryType, QueryType> = {
  tool: 'tools',
  guideline: 'guidelines',
  knowledge: 'knowledge',
  experience: 'experiences',
} as const;

// =============================================================================
// TYPE CONVERSION FUNCTIONS
// =============================================================================

/**
 * Convert QueryType to QueryEntryType.
 * e.g., 'tools' -> 'tool'
 */
export function queryTypeToEntryType(type: QueryType): QueryEntryType {
  return QUERY_TYPE_TO_ENTRY_TYPE[type];
}

/**
 * Convert QueryEntryType to QueryType.
 * e.g., 'tool' -> 'tools'
 */
export function entryTypeToQueryType(type: QueryEntryType): QueryType {
  return ENTRY_TYPE_TO_QUERY_TYPE[type];
}

// =============================================================================
// TABLE MAPPINGS
// =============================================================================

/**
 * Mapping from QueryType to Drizzle table reference.
 */
export const QUERY_TYPE_TO_TABLE = {
  tools: tools,
  guidelines: guidelines,
  knowledge: knowledge,
  experiences: experiences,
} as const;

/**
 * Mapping from QueryType to table name string (for raw SQL).
 */
export const QUERY_TYPE_TO_TABLE_NAME: Record<QueryType, string> = {
  tools: 'tools',
  guidelines: 'guidelines',
  knowledge: 'knowledge',
  experiences: 'experiences',
} as const;

/**
 * Mapping from QueryEntryType to table name string.
 */
export const ENTRY_TYPE_TO_TABLE_NAME: Record<QueryEntryType, string> = {
  tool: 'tools',
  guideline: 'guidelines',
  knowledge: 'knowledge',
  experience: 'experiences',
} as const;

// =============================================================================
// FIELD NAME MAPPINGS
// =============================================================================

/**
 * Mapping from QueryType to the field used as the entry's key/name.
 * - tools and guidelines use 'name'
 * - knowledge and experiences use 'title'
 */
export const ENTRY_TYPE_KEY_FIELD: Record<QueryType, 'name' | 'title'> = {
  tools: 'name',
  guidelines: 'name',
  knowledge: 'title',
  experiences: 'title',
} as const;

/**
 * Get the identifying field value from an entry.
 *
 * @param entry - The entry object (Tool, Guideline, Knowledge, or Experience)
 * @param type - The query type to determine which field to use
 * @returns The value of the name/title field
 */
export function getEntryKeyValue(entry: EntryUnion, type: QueryType): string {
  if (type === 'knowledge' || type === 'experiences') {
    return (entry as { title: string }).title ?? '';
  }
  return (entry as { name: string }).name ?? '';
}
