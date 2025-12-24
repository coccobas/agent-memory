-- Migration 0018: Add reinforcement learning feedback tracking tables
-- This migration creates tables for tracking memory retrieval, task outcomes,
-- extraction decisions, and consolidation decisions to support RL-based optimization.

-- =============================================================================
-- MEMORY RETRIEVALS TABLE
-- Track every memory retrieval from the query pipeline
-- =============================================================================

CREATE TABLE IF NOT EXISTS memory_retrievals (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    conversation_id TEXT,

    -- Query information
    query_text TEXT,
    query_hash TEXT,

    -- Retrieved entry
    entry_type TEXT NOT NULL CHECK (entry_type IN ('tool', 'guideline', 'knowledge', 'experience')),
    entry_id TEXT NOT NULL,

    -- Retrieval metrics
    retrieval_rank INTEGER NOT NULL,
    retrieval_score REAL NOT NULL,
    semantic_score REAL,
    context_tokens INTEGER,

    -- Audit
    retrieved_at TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Indexes for memory_retrievals
CREATE INDEX IF NOT EXISTS idx_retrievals_session ON memory_retrievals(session_id);
CREATE INDEX IF NOT EXISTS idx_retrievals_entry ON memory_retrievals(entry_type, entry_id);
CREATE INDEX IF NOT EXISTS idx_retrievals_query_hash ON memory_retrievals(query_hash);
CREATE INDEX IF NOT EXISTS idx_retrievals_timestamp ON memory_retrievals(retrieved_at);
CREATE INDEX IF NOT EXISTS idx_retrievals_rank ON memory_retrievals(retrieval_rank);

-- =============================================================================
-- TASK OUTCOMES TABLE
-- Track session/task outcomes for success signal
-- =============================================================================

CREATE TABLE IF NOT EXISTS task_outcomes (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    conversation_id TEXT,

    -- Outcome classification
    outcome_type TEXT NOT NULL CHECK (outcome_type IN ('success', 'failure', 'partial', 'unknown')),
    outcome_signal TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 1.0,

    -- Additional context
    metadata TEXT,

    -- Audit
    outcome_at TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Indexes for task_outcomes
CREATE INDEX IF NOT EXISTS idx_outcomes_session ON task_outcomes(session_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_type ON task_outcomes(outcome_type);
CREATE INDEX IF NOT EXISTS idx_outcomes_timestamp ON task_outcomes(outcome_at);

-- =============================================================================
-- RETRIEVAL OUTCOMES TABLE
-- Many-to-many linking retrievals to outcomes with contribution scores
-- =============================================================================

CREATE TABLE IF NOT EXISTS retrieval_outcomes (
    id TEXT PRIMARY KEY NOT NULL,
    retrieval_id TEXT NOT NULL,
    outcome_id TEXT NOT NULL,

    -- Attribution
    contribution_score REAL,
    attribution_method TEXT NOT NULL DEFAULT 'linear',

    -- Audit
    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (retrieval_id) REFERENCES memory_retrievals(id) ON DELETE CASCADE,
    FOREIGN KEY (outcome_id) REFERENCES task_outcomes(id) ON DELETE CASCADE
);

-- Indexes for retrieval_outcomes
CREATE INDEX IF NOT EXISTS idx_ret_outcomes_retrieval ON retrieval_outcomes(retrieval_id);
CREATE INDEX IF NOT EXISTS idx_ret_outcomes_outcome ON retrieval_outcomes(outcome_id);
CREATE INDEX IF NOT EXISTS idx_ret_outcomes_score ON retrieval_outcomes(contribution_score);

-- =============================================================================
-- EXTRACTION DECISIONS TABLE
-- Track capture service decisions (store/skip/defer)
-- =============================================================================

CREATE TABLE IF NOT EXISTS extraction_decisions (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    turn_number INTEGER,

    -- Decision
    decision TEXT NOT NULL CHECK (decision IN ('store', 'skip', 'defer')),
    entry_type TEXT CHECK (entry_type IN ('tool', 'guideline', 'knowledge', 'experience')),
    entry_id TEXT,

    -- Context
    context_hash TEXT NOT NULL,
    confidence REAL NOT NULL,
    state_features TEXT,

    -- Audit
    decided_at TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Indexes for extraction_decisions
CREATE INDEX IF NOT EXISTS idx_extraction_session ON extraction_decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_extraction_decision ON extraction_decisions(decision);
CREATE INDEX IF NOT EXISTS idx_extraction_entry ON extraction_decisions(entry_type, entry_id);
CREATE INDEX IF NOT EXISTS idx_extraction_hash ON extraction_decisions(context_hash);
CREATE INDEX IF NOT EXISTS idx_extraction_timestamp ON extraction_decisions(decided_at);

-- =============================================================================
-- EXTRACTION OUTCOMES TABLE
-- Track effectiveness of stored entries
-- =============================================================================

CREATE TABLE IF NOT EXISTS extraction_outcomes (
    id TEXT PRIMARY KEY NOT NULL,
    decision_id TEXT NOT NULL,
    entry_id TEXT NOT NULL,

    -- Usage metrics
    retrieval_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    last_retrieved_at TEXT,

    -- Overall score
    outcome_score REAL,

    -- Audit
    evaluated_at TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (decision_id) REFERENCES extraction_decisions(id) ON DELETE CASCADE
);

-- Indexes for extraction_outcomes
CREATE INDEX IF NOT EXISTS idx_ext_outcomes_decision ON extraction_outcomes(decision_id);
CREATE INDEX IF NOT EXISTS idx_ext_outcomes_entry ON extraction_outcomes(entry_id);
CREATE INDEX IF NOT EXISTS idx_ext_outcomes_score ON extraction_outcomes(outcome_score);

-- =============================================================================
-- CONSOLIDATION DECISIONS TABLE
-- Track librarian consolidation decisions (merge/dedupe/archive/abstract)
-- =============================================================================

CREATE TABLE IF NOT EXISTS consolidation_decisions (
    id TEXT PRIMARY KEY NOT NULL,

    -- Scope
    scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'org', 'project', 'session')),
    scope_id TEXT,

    -- Decision
    action TEXT NOT NULL CHECK (action IN ('merge', 'dedupe', 'archive', 'abstract', 'keep')),
    source_entry_ids TEXT NOT NULL,
    target_entry_id TEXT,

    -- Metrics
    similarity_score REAL,
    state_features TEXT,

    -- Audit
    decided_at TEXT NOT NULL DEFAULT (datetime('now')),
    decided_by TEXT
);

-- Indexes for consolidation_decisions
CREATE INDEX IF NOT EXISTS idx_consolidation_scope ON consolidation_decisions(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_consolidation_action ON consolidation_decisions(action);
CREATE INDEX IF NOT EXISTS idx_consolidation_target ON consolidation_decisions(target_entry_id);
CREATE INDEX IF NOT EXISTS idx_consolidation_timestamp ON consolidation_decisions(decided_at);

-- =============================================================================
-- CONSOLIDATION OUTCOMES TABLE
-- Track effectiveness of consolidation decisions
-- =============================================================================

CREATE TABLE IF NOT EXISTS consolidation_outcomes (
    id TEXT PRIMARY KEY NOT NULL,
    decision_id TEXT NOT NULL,

    -- Pre/post metrics
    pre_retrieval_rate REAL,
    post_retrieval_rate REAL,
    pre_success_rate REAL,
    post_success_rate REAL,

    -- Evaluation window
    evaluation_window_days INTEGER NOT NULL,

    -- Overall score
    outcome_score REAL,

    -- Audit
    evaluated_at TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (decision_id) REFERENCES consolidation_decisions(id) ON DELETE CASCADE
);

-- Indexes for consolidation_outcomes
CREATE INDEX IF NOT EXISTS idx_cons_outcomes_decision ON consolidation_outcomes(decision_id);
CREATE INDEX IF NOT EXISTS idx_cons_outcomes_score ON consolidation_outcomes(outcome_score);
CREATE INDEX IF NOT EXISTS idx_cons_outcomes_timestamp ON consolidation_outcomes(evaluated_at);
