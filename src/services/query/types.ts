/**
 * Query Pipeline Shared Types
 *
 * Single source of truth for query pipeline type definitions.
 * Extracted to break circular dependencies between pipeline.ts and stage modules.
 */

import type { Tool, Guideline, Knowledge, Experience, Tag, ScopeType } from '../../db/schema.js';

// =============================================================================
// ENTRY TYPE DEFINITIONS
// =============================================================================

/**
 * Singular entry type identifier (database-level)
 */
export type QueryEntryType = 'tool' | 'guideline' | 'knowledge' | 'experience';

/**
 * Plural query type identifier (API-level)
 */
export type QueryType = 'tools' | 'guidelines' | 'knowledge' | 'experiences';

/**
 * Union of all entry types
 */
export type EntryUnion = Tool | Guideline | Knowledge | Experience;

// =============================================================================
// SCOPE TYPES
// =============================================================================

/**
 * Describes a scope level in the hierarchy
 */
export interface ScopeDescriptor {
  scopeType: ScopeType;
  scopeId: string | null;
}

/**
 * Parent scope lookup result
 */
export interface ParentScopeInfo {
  projectId?: string | null;
  orgId?: string | null;
}

// =============================================================================
// FILTERED ENTRY TYPES
// =============================================================================

/**
 * Result from filter stage for a single entry.
 * Contains the entry plus metadata used for scoring.
 */
export interface FilteredEntry<T extends EntryUnion> {
  entry: T;
  scopeIndex: number;
  tags: Tag[];
  textMatched: boolean;
  matchingTagCount: number;
  hasExplicitRelation: boolean;
}

/**
 * Complete filter stage result containing filtered entries by type.
 */
export interface FilterStageResult {
  tools: FilteredEntry<Tool>[];
  guidelines: FilteredEntry<Guideline>[];
  knowledge: FilteredEntry<Knowledge>[];
  experiences: FilteredEntry<Experience>[];
}

// =============================================================================
// EXCLUSION TYPES (Negative Examples)
// =============================================================================

/**
 * Parsed exclusion from query.
 * Supports syntax: -term or -"multi word phrase"
 */
export interface ParsedExclusion {
  term: string;
  isPhrase: boolean;
}

/**
 * Result of parsing exclusions from a query string.
 */
export interface ExclusionParseResult {
  cleanedQuery: string;
  exclusions: ParsedExclusion[];
}
