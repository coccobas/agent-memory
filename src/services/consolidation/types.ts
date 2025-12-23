/**
 * Consolidation Service Types
 */

import type { ScopeType, EntryType } from '../../db/schema.js';
import type { DbClient } from '../../db/connection.js';

// =============================================================================
// STRATEGY TYPES
// =============================================================================

export type ConsolidationStrategyType = 'semantic_merge' | 'dedupe' | 'abstract';

// =============================================================================
// CONSOLIDATION PARAMS
// =============================================================================

export interface ConsolidationParams {
  scopeType: ScopeType;
  scopeId?: string;
  entryTypes?: EntryType[];
  strategy: ConsolidationStrategyType;
  threshold?: number; // Similarity threshold (0-1), default 0.85
  dryRun?: boolean; // If true, only report what would be consolidated
  limit?: number; // Max number of consolidation groups to process
  consolidatedBy?: string; // Agent/user ID for audit
  db: DbClient; // Database client
}

export interface FindSimilarParams {
  scopeType: ScopeType;
  scopeId?: string;
  entryTypes?: EntryType[];
  threshold?: number;
  limit?: number;
  db: DbClient; // Database client
}

// =============================================================================
// SIMILARITY GROUP
// =============================================================================

export interface SimilarityGroupMember {
  id: string;
  name: string;
  similarity: number;
  createdAt: string;
  updatedAt?: string;
}

export interface SimilarityGroup {
  primaryId: string;
  primaryName: string;
  entryType: EntryType;
  members: SimilarityGroupMember[];
  averageSimilarity: number;
}

// =============================================================================
// RESULTS
// =============================================================================

export interface StrategyResult {
  success: boolean;
  entriesProcessed: number;
  entriesDeactivated: number;
  entriesMerged: number;
  relationsCreated: number;
  error?: string;
}

export interface ConsolidationResult {
  strategy: ConsolidationStrategyType;
  dryRun: boolean;
  groupsFound: number;
  entriesProcessed: number;
  entriesMerged: number;
  entriesDeactivated: number;
  groups: SimilarityGroup[];
  errors: string[];
}

// =============================================================================
// ARCHIVE STALE
// =============================================================================

export interface ArchiveStaleParams {
  scopeType: ScopeType;
  scopeId?: string;
  entryTypes?: EntryType[];
  staleDays: number; // Entries older than this are considered stale
  minRecencyScore?: number; // Optional: only archive if recencyScore is below this (0-1)
  dryRun?: boolean;
  archivedBy?: string;
  db: DbClient; // Database client
}

export interface ArchivedEntryInfo {
  id: string;
  type: EntryType;
  name: string;
  ageDays: number;
  recencyScore: number;
}

export interface ArchiveStaleResult {
  dryRun: boolean;
  staleDays: number;
  minRecencyScore?: number;
  entriesScanned: number;
  entriesArchived: number;
  archivedEntries: ArchivedEntryInfo[];
  errors: string[];
}

// =============================================================================
// ENTRY FOR CONSOLIDATION
// =============================================================================

export interface EntryForConsolidation {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
}
