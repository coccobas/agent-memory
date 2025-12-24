/**
 * Coarse-to-Fine Retrieval Types
 *
 * Types for hierarchical summary retrieval and navigation.
 * Enables efficient search by starting broad (domain summaries) and
 * progressively drilling down to specific entries.
 */

import type { SummaryMemberType } from '../../../db/schema.js';

/**
 * Options for coarse-to-fine retrieval
 */
export interface CoarseToFineOptions {
  /** The search query text */
  query: string;

  /** Pre-computed query embedding (optional, will be generated if not provided) */
  queryEmbedding?: number[];

  /** Scope for the search */
  scopeType?: 'global' | 'org' | 'project' | 'session';
  scopeId?: string;

  /** Maximum number of final results to return (default: 10) */
  maxResults?: number;

  /** Starting hierarchy level (default: highest available level) */
  startLevel?: number;

  /** How many candidates to expand at each level (default: 3) */
  expansionFactor?: number;

  /** Minimum similarity threshold (default: 0.5) */
  minSimilarity?: number;

  /** Filter by entry types (applies only to final level-0 entries) */
  entryTypes?: SummaryMemberType[];
}

/**
 * Metadata about a retrieval step at a specific hierarchy level
 */
export interface RetrievalStep {
  /** Hierarchy level (0=entries, 1=topics, 2=domains) */
  level: number;

  /** Number of summaries searched at this level */
  summariesSearched: number;

  /** Number of summaries that matched the query */
  summariesMatched: number;

  /** Time spent at this level in milliseconds */
  timeMs: number;
}

/**
 * A single retrieved entry with its path through the hierarchy
 */
export interface RetrievedEntry {
  /** Entry ID */
  id: string;

  /** Entry type */
  type: SummaryMemberType;

  /** Similarity score to the query (0.0-1.0) */
  score: number;

  /** Path of summary IDs from top-level to this entry */
  path: string[];

  /** Path of summary titles from top-level to this entry (for display) */
  pathTitles?: string[];
}

/**
 * Result of coarse-to-fine retrieval
 */
export interface CoarseToFineResult {
  /** Retrieved entries ordered by relevance */
  entries: RetrievedEntry[];

  /** Retrieval steps taken (one per hierarchy level) */
  steps: RetrievalStep[];

  /** Total retrieval time in milliseconds */
  totalTimeMs: number;

  /** Query embedding used (useful for caching) */
  queryEmbedding?: number[];
}

/**
 * Summary entry with embedding for similarity search
 */
export interface SummaryEntry {
  id: string;
  scopeType: string;
  scopeId: string | null;
  hierarchyLevel: number;
  parentSummaryId: string | null;
  title: string;
  content: string;
  memberCount: number;
  embedding: number[] | null;
  embeddingDimension: number | null;
  coherenceScore: number | null;
  compressionRatio: number | null;
  isActive: boolean;
  needsRegeneration: boolean;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string | null;
  accessCount: number;
}

/**
 * Member of a summary (entry or child summary)
 */
export interface SummaryMemberEntry {
  id: string;
  summaryId: string;
  memberType: SummaryMemberType;
  memberId: string;
  contributionScore: number | null;
  displayOrder: number | null;
  createdAt: string;
}

/**
 * Drill-down result showing summary details and children
 */
export interface DrillDownResult {
  /** The summary being drilled into */
  summary: SummaryEntry;

  /** Child summaries (if any) */
  children: SummaryEntry[];

  /** Direct member entries with their scores */
  members: Array<{
    id: string;
    type: SummaryMemberType;
    score: number;
  }>;
}
