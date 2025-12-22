/**
 * Memory Consolidation Service
 *
 * This file re-exports from the modular consolidation/ directory for backward compatibility.
 * New code should import from './consolidation/index.js'.
 */

export {
  // Types
  type ConsolidationStrategy,
  type ConsolidationParams,
  type FindSimilarParams,
  type SimilarityGroup,
  type SimilarityGroupMember,
  type ConsolidationResult,
  type StrategyResult,
  type ArchiveStaleParams,
  type ArchiveStaleResult,
  type ArchivedEntryInfo,
  type EntryForConsolidation,
  // Main functions
  findSimilarGroups,
  consolidate,
  archiveStale,
  // Strategy interface and registry (advanced use)
  type ConsolidationStrategyInterface,
  getStrategy,
  strategyRegistry,
  DedupeStrategy,
  MergeStrategy,
  AbstractStrategy,
  // Helpers (for testing or extension)
  getEntriesForConsolidation,
  getEntryDetails,
  deactivateEntry,
  batchDeactivateEntries,
  updateEntryContent,
  createConsolidationRelation,
  createMergedContent,
  calculateRecencyScore,
  getAgeDays,
} from './consolidation/index.js';
