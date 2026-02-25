/**
 * Source Adapter Types
 *
 * Shared contracts for importing content from external sources
 * (Notion, Slack, GitHub, etc.) into the v2 memory system.
 *
 * Each source implements SourceAdapter; the generic ingest handler
 * composes adapter + dedup + mapper to produce v2 entries.
 */

import type { EntryType } from '../contracts/index.js';

// ---------------------------------------------------------------------------
// Input: what the caller provides per page/document
// ---------------------------------------------------------------------------

export interface SourcePageInput {
  /** Unique ID in source system (e.g., Notion page UUID) */
  readonly sourceId: string;
  /** Document title */
  readonly title: string;
  /** Raw content from source (markdown, HTML, etc.) */
  readonly content: string;
  /** URL back to the source document */
  readonly url?: string;
  /** Override auto-detection of entry type */
  readonly entryType?: EntryType;
  /** Override auto-categorization */
  readonly category?: string;
  /** Additional tags to attach */
  readonly tags?: readonly string[];
  /** Arbitrary metadata to merge into the entry */
  readonly metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Adapter: source-specific normalization strategy
// ---------------------------------------------------------------------------

export interface SourceAdapter {
  /** Human-readable source name: 'notion', 'slack', 'github', etc. */
  readonly sourceName: string;
  /** Metadata field that stores the source ID for dedup: 'notionPageId', 'slackThreadId', etc. */
  readonly metadataIdField: string;
  /** Normalize raw content into clean markdown */
  normalizeContent(raw: string): string;
}

// ---------------------------------------------------------------------------
// Results: what the ingest handler returns
// ---------------------------------------------------------------------------

export interface SourcePageResult {
  readonly sourceId: string;
  readonly entryId: string;
  readonly action: 'created' | 'updated' | 'skipped' | 'error';
  readonly entryType?: EntryType;
  readonly title?: string;
  readonly error?: string;
}

export interface SourceIngestResult {
  readonly results: readonly SourcePageResult[];
  readonly summary: {
    readonly created: number;
    readonly updated: number;
    readonly skipped: number;
    readonly errors: number;
  };
  readonly _display?: string;
}
