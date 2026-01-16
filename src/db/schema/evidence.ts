/**
 * Evidence table - immutable artifacts that support memory entries
 *
 * Evidence captures concrete proof, artifacts, and supporting materials
 * that back up knowledge, experiences, and decisions. Evidence is IMMUTABLE -
 * once created, it cannot be modified, only deactivated.
 *
 * Types include screenshots, logs, code snippets, benchmark results,
 * external links, documents, and quotes from sources.
 */

import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Evidence type enum - categorizes the kind of evidence
 */
export type EvidenceType =
  | 'screenshot'
  | 'log'
  | 'snippet'
  | 'output'
  | 'benchmark'
  | 'link'
  | 'document'
  | 'quote'
  | 'other';

/**
 * Evidence - immutable artifacts supporting memory entries
 */
export const evidence = sqliteTable(
  'evidence',
  {
    id: text('id').primaryKey(), // ev_<nanoid>

    // Scope
    scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }).notNull(),
    scopeId: text('scope_id'),

    // Identity
    title: text('title').notNull(),
    description: text('description'),
    evidenceType: text('evidence_type', {
      enum: [
        'screenshot',
        'log',
        'snippet',
        'output',
        'benchmark',
        'link',
        'document',
        'quote',
        'other',
      ],
    }).notNull(),

    // Content - one of these should be populated
    content: text('content'), // Inline text content
    filePath: text('file_path'), // Local file path
    url: text('url'), // External URL

    // File metadata
    fileName: text('file_name'), // Original filename
    mimeType: text('mime_type'),
    fileSize: integer('file_size'),
    checksum: text('checksum'), // sha256

    // Code snippet fields
    language: text('language'), // Programming language for snippets
    sourceFile: text('source_file'), // Which file snippet came from
    startLine: integer('start_line'),
    endLine: integer('end_line'),

    // Benchmark fields
    metric: text('metric'), // What was measured (e.g., 'response_time', 'memory_usage')
    value: real('value'), // Measured value
    unit: text('unit'), // ms, MB, req/s, etc.
    baseline: real('baseline'), // Comparison value

    // Provenance
    source: text('source'), // Where this came from (URL, tool, person, etc.)
    capturedAt: text('captured_at').notNull(), // When the evidence was collected
    capturedBy: text('captured_by'), // Who/what captured it

    // Flexible storage
    tags: text('tags'), // JSON array of tags
    metadata: text('metadata'), // JSON object for additional data

    // Audit (IMMUTABLE - no updatedAt/updatedBy)
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdBy: text('created_by'),
    isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
  },
  (table) => [
    index('idx_evidence_scope').on(table.scopeType, table.scopeId),
    index('idx_evidence_type').on(table.evidenceType),
    index('idx_evidence_captured_at').on(table.capturedAt),
    index('idx_evidence_created_at').on(table.createdAt),
    index('idx_evidence_file_path').on(table.filePath),
    index('idx_evidence_url').on(table.url),
  ]
);

// Type exports
export type Evidence = typeof evidence.$inferSelect;
export type NewEvidence = typeof evidence.$inferInsert;
