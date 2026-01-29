import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Tool Outcomes Table - Event-Level Schema
 *
 * Stores one row per tool execution (not aggregated).
 * Used for sequence analysis, pattern detection, and recovery tracking.
 *
 * CRITICAL TIMESTAMP RULES:
 * - Repository ALWAYS sets: `createdAt: new Date().toISOString()`
 * - ID generation: `out_${generateId()}` (UUID v4, NOT ULID)
 * - All ORDER BY queries use: `ORDER BY created_at DESC, id DESC` (tie-breaker required)
 * - Format: ISO 8601 with millisecond precision (e.g., "2026-01-29T10:30:45.123Z")
 */
export const toolOutcomes = sqliteTable(
  'tool_outcomes',
  {
    // Primary key - one row per tool execution
    id: text('id').primaryKey().notNull(),

    // Session context
    sessionId: text('session_id').notNull(),
    projectId: text('project_id'),

    // Tool identification
    toolName: text('tool_name').notNull(),

    // Outcome classification
    outcome: text('outcome').notNull(), // 'success' | 'failure' | 'partial'
    outcomeType: text('outcome_type'), // error type for failures, null for success/partial
    message: text('message'), // Error message OR success summary

    // Privacy-safe context (REDACTED)
    toolInputHash: text('tool_input_hash'), // SHA-256 hash, not raw input
    inputSummary: text('input_summary'), // Truncated + redacted (max 200 chars)
    outputSummary: text('output_summary'), // Truncated + redacted (max 500 chars)

    // Execution metrics
    durationMs: integer('duration_ms'), // Heuristic: time since last outcome

    // Sequence tracking
    precedingToolId: text('preceding_tool_id'), // FK to previous tool_outcomes.id in session

    // Analysis tracking
    analyzed: integer('analyzed').default(0).notNull(), // 0=pending, 1=analyzed

    // Timestamp (one per execution)
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    sessionIdx: index('tool_outcomes_session_idx').on(table.sessionId),
    createdAtIdx: index('tool_outcomes_created_at_idx').on(table.createdAt),
    projectIdx: index('tool_outcomes_project_idx').on(table.projectId),
  })
);

export type ToolOutcome = typeof toolOutcomes.$inferSelect;
export type NewToolOutcome = typeof toolOutcomes.$inferInsert;
