/**
 * RL Feedback tables: Training data collection for reinforcement learning policies
 *
 * This schema supports the RL-based memory operations plan by tracking:
 * - Memory retrievals and their outcomes
 * - Extraction decisions and their usefulness
 * - Consolidation decisions and their effectiveness
 *
 * All data collected here feeds into offline training of three RL policies:
 * 1. Extraction Policy - what to store from conversations
 * 2. Retrieval Policy - when to query memory vs generate directly
 * 3. Consolidation Policy - how to merge, dedupe, and forget entries
 */

import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Entry type enum - matches core memory types
 */
export type EntryType = 'tool' | 'guideline' | 'knowledge' | 'experience';

/**
 * Outcome type enum - task completion status
 */
export type OutcomeType = 'success' | 'failure' | 'partial' | 'unknown';

/**
 * Outcome signal enum - how the outcome was determined
 */
export type OutcomeSignal = 'session_status' | 'explicit_feedback' | 'inferred' | 'error_absence';

/**
 * Extraction decision type enum - what action was taken
 */
export type ExtractionDecisionType = 'store' | 'skip' | 'defer';

/**
 * Consolidation action enum - what consolidation was performed
 */
export type ConsolidationAction = 'merge' | 'dedupe' | 'archive' | 'abstract' | 'keep';

/**
 * Attribution method enum - how contribution scores are calculated
 */
export type AttributionMethod = 'last_touch' | 'linear' | 'attention';

/**
 * Scope type enum - matches core scope types
 */
export type ScopeType = 'global' | 'org' | 'project' | 'session';

/**
 * Memory retrievals - track every query pipeline retrieval event
 *
 * Records each memory entry retrieved during query execution, including
 * the query context, retrieval rank, and scoring. Used to train retrieval
 * and extraction policies by linking retrievals to task outcomes.
 */
export const memoryRetrievals = sqliteTable(
  'memory_retrievals',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),

    // Query context
    queryText: text('query_text'),
    queryEmbedding: text('query_embedding'), // Stored as blob/base64

    // Retrieved entry
    entryType: text('entry_type', { enum: ['tool', 'guideline', 'knowledge', 'experience'] }).notNull(),
    entryId: text('entry_id').notNull(),

    // Retrieval metrics
    retrievalRank: integer('retrieval_rank'), // Position in results (1-based)
    retrievalScore: real('retrieval_score'),   // Score from query pipeline

    // Timestamp
    retrievedAt: text('retrieved_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_retrievals_session').on(table.sessionId),
    index('idx_retrievals_entry').on(table.entryType, table.entryId),
    index('idx_retrievals_retrieved_at').on(table.retrievedAt),
  ]
);

/**
 * Task outcomes - track session/task completion results
 *
 * Records the outcome of a task or session, which provides the reward signal
 * for RL training. Outcomes can be explicitly provided or inferred from
 * session status, error patterns, or LLM analysis.
 */
export const taskOutcomes = sqliteTable(
  'task_outcomes',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    conversationId: text('conversation_id'),

    // Outcome classification
    outcomeType: text('outcome_type', {
      enum: ['success', 'failure', 'partial', 'unknown']
    }).notNull(),
    outcomeSignal: text('outcome_signal', {
      enum: ['session_status', 'explicit_feedback', 'inferred', 'error_absence']
    }),
    confidence: real('confidence').default(1.0).notNull(),

    // Metadata
    metadata: text('metadata', { mode: 'json' }).$type<{
      errorMessages?: string[];
      userFeedback?: string;
      retryCount?: number;
      [key: string]: unknown;
    }>(),

    // Timestamp
    outcomeAt: text('outcome_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_outcomes_session').on(table.sessionId),
    index('idx_outcomes_type').on(table.outcomeType),
    index('idx_outcomes_at').on(table.outcomeAt),
  ]
);

/**
 * Retrieval outcomes - link retrievals to task outcomes (many-to-many)
 *
 * Connects memory retrievals to task outcomes with attribution scores.
 * This enables credit assignment: which retrieved entries contributed
 * to task success or failure, and by how much.
 */
export const retrievalOutcomes = sqliteTable(
  'retrieval_outcomes',
  {
    id: text('id').primaryKey(),
    retrievalId: text('retrieval_id').notNull(),
    outcomeId: text('outcome_id').notNull(),

    // Attribution
    contributionScore: real('contribution_score'), // -1 to 1 (negative if harmful)
    attributionMethod: text('attribution_method', {
      enum: ['last_touch', 'linear', 'attention']
    }),

    // Timestamp
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_retrieval_outcomes_retrieval').on(table.retrievalId),
    index('idx_retrieval_outcomes_outcome').on(table.outcomeId),
    index('idx_retrieval_outcomes_score').on(table.contributionScore),
  ]
);

/**
 * Extraction decisions - track capture service decisions
 *
 * Records each decision made by the extraction policy (or threshold rules)
 * about whether to store content from a conversation turn. Links decisions
 * to the created entry if content was stored.
 */
export const extractionDecisions = sqliteTable(
  'extraction_decisions',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    turnNumber: integer('turn_number'),

    // Decision
    decision: text('decision', { enum: ['store', 'skip', 'defer'] }).notNull(),
    entryType: text('entry_type', { enum: ['tool', 'guideline', 'knowledge', 'experience'] }),
    entryId: text('entry_id'), // If stored: the created entry ID

    // Context
    contextHash: text('context_hash'), // Hash of conversation context
    confidence: real('confidence'),     // Decision confidence

    // Timestamp
    decidedAt: text('decided_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_extraction_session').on(table.sessionId),
    index('idx_extraction_entry').on(table.entryId),
    index('idx_extraction_decision').on(table.decision),
    index('idx_extraction_decided_at').on(table.decidedAt),
  ]
);

/**
 * Extraction outcomes - evaluate stored entry usefulness
 *
 * Tracks whether stored entries were actually retrieved and used successfully.
 * This provides the reward signal for training the extraction policy:
 * - High retrieval + success = good extraction decision
 * - Zero retrievals = wasted storage (should have skipped)
 * - High retrievals + failures = harmful content (should have filtered)
 */
export const extractionOutcomes = sqliteTable(
  'extraction_outcomes',
  {
    id: text('id').primaryKey(),
    decisionId: text('decision_id').notNull(),
    entryId: text('entry_id').notNull(),

    // Usage metrics
    retrievalCount: integer('retrieval_count').default(0).notNull(),
    successCount: integer('success_count').default(0).notNull(),
    lastRetrievedAt: text('last_retrieved_at'),

    // Computed reward
    outcomeScore: real('outcome_score'), // Normalized reward signal

    // Timestamp
    evaluatedAt: text('evaluated_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_extraction_outcomes_decision').on(table.decisionId),
    index('idx_extraction_outcomes_entry').on(table.entryId),
    index('idx_extraction_outcomes_score').on(table.outcomeScore),
  ]
);

/**
 * Consolidation decisions - track librarian consolidation actions
 *
 * Records decisions made by the consolidation policy (or librarian agent)
 * about how to handle groups of similar entries. Tracks the action taken,
 * source entries involved, and resulting merged entry if applicable.
 */
export const consolidationDecisions = sqliteTable(
  'consolidation_decisions',
  {
    id: text('id').primaryKey(),
    scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }).notNull(),
    scopeId: text('scope_id'),

    // Decision
    action: text('action', {
      enum: ['merge', 'dedupe', 'archive', 'abstract', 'keep']
    }).notNull(),
    sourceEntryIds: text('source_entry_ids').notNull(), // JSON array of entry IDs
    targetEntryId: text('target_entry_id'),             // If merged: result entry ID

    // Metrics
    similarityScore: real('similarity_score'),

    // Audit
    decidedAt: text('decided_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    decidedBy: text('decided_by'), // agent|librarian|user
  },
  (table) => [
    index('idx_consolidation_scope').on(table.scopeType, table.scopeId),
    index('idx_consolidation_action').on(table.action),
    index('idx_consolidation_target').on(table.targetEntryId),
    index('idx_consolidation_decided_at').on(table.decidedAt),
  ]
);

/**
 * Consolidation outcomes - evaluate consolidation effectiveness
 *
 * Measures the impact of consolidation decisions by comparing retrieval
 * and success rates before and after the action. This provides the reward
 * signal for training the consolidation policy:
 * - Improved retrieval rate + reduced storage = good consolidation
 * - Degraded retrieval rate = information loss (bad consolidation)
 */
export const consolidationOutcomes = sqliteTable(
  'consolidation_outcomes',
  {
    id: text('id').primaryKey(),
    decisionId: text('decision_id').notNull(),

    // Before/after metrics
    preRetrievalRate: real('pre_retrieval_rate'),
    postRetrievalRate: real('post_retrieval_rate'),
    preSuccessRate: real('pre_success_rate'),
    postSuccessRate: real('post_success_rate'),

    // Evaluation window
    evaluationWindowDays: integer('evaluation_window_days'),

    // Computed reward
    outcomeScore: real('outcome_score'), // Normalized reward signal

    // Timestamp
    evaluatedAt: text('evaluated_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_consolidation_outcomes_decision').on(table.decisionId),
    index('idx_consolidation_outcomes_score').on(table.outcomeScore),
  ]
);

// Type exports
export type MemoryRetrieval = typeof memoryRetrievals.$inferSelect;
export type NewMemoryRetrieval = typeof memoryRetrievals.$inferInsert;

export type TaskOutcome = typeof taskOutcomes.$inferSelect;
export type NewTaskOutcome = typeof taskOutcomes.$inferInsert;

export type RetrievalOutcome = typeof retrievalOutcomes.$inferSelect;
export type NewRetrievalOutcome = typeof retrievalOutcomes.$inferInsert;

export type ExtractionDecision = typeof extractionDecisions.$inferSelect;
export type NewExtractionDecision = typeof extractionDecisions.$inferInsert;

export type ExtractionOutcome = typeof extractionOutcomes.$inferSelect;
export type NewExtractionOutcome = typeof extractionOutcomes.$inferInsert;

export type ConsolidationDecision = typeof consolidationDecisions.$inferSelect;
export type NewConsolidationDecision = typeof consolidationDecisions.$inferInsert;

export type ConsolidationOutcome = typeof consolidationOutcomes.$inferSelect;
export type NewConsolidationOutcome = typeof consolidationOutcomes.$inferInsert;
