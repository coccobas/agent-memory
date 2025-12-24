/**
 * Memory Consolidation Service
 *
 * Implements memory consolidation as described in "Memory in the Age of AI Agents" (arXiv:2512.13564).
 * Consolidation merges semantically similar entries, abstracts patterns, and maintains provenance.
 *
 * Strategies:
 * - semantic_merge: Merge entries with high semantic similarity
 * - dedupe: Remove near-duplicates, keeping the most recent
 * - abstract: Create a higher-level summary from related entries
 *
 * This module re-exports from the modular structure for backward compatibility.
 */

// Re-export types
export type {
  ConsolidationStrategyType as ConsolidationStrategy,
  ConsolidationParams,
  ConsolidationServices,
  FindSimilarParams,
  SimilarityGroup,
  SimilarityGroupMember,
  ConsolidationResult,
  StrategyResult,
  ArchiveStaleParams,
  ArchiveStaleResult,
  ArchivedEntryInfo,
  EntryForConsolidation,
} from './types.js';

// Re-export main functions
export { findSimilarGroups } from './discovery.js';
export { consolidate } from './orchestrator.js';
export { archiveStale } from './archive-stale.js';

// Re-export strategy interface and registry for advanced use
export type { ConsolidationStrategy as ConsolidationStrategyInterface } from './strategy.interface.js';
export { getStrategy, strategyRegistry } from './strategies/index.js';
export { DedupeStrategy, MergeStrategy, AbstractStrategy } from './strategies/index.js';

// Re-export helpers for testing or extension
export {
  getEntriesForConsolidation,
  getEntryDetails,
  deactivateEntry,
  batchDeactivateEntries,
  updateEntryContent,
  createConsolidationRelation,
  createMergedContent,
  calculateRecencyScore,
  getAgeDays,
} from './helpers.js';
