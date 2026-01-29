-- Migration 0041: Add tool_outcomes event-level table and session_tool_counter
-- Stores tool execution outcomes for sequence analysis and pattern detection

CREATE TABLE IF NOT EXISTS tool_outcomes (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  project_id TEXT,
  tool_name TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'partial')),
  outcome_type TEXT,
  message TEXT,
  tool_input_hash TEXT,
  input_summary TEXT,
  output_summary TEXT,
  duration_ms INTEGER,
  preceding_tool_id TEXT,
  analyzed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS tool_outcomes_session_idx ON tool_outcomes(session_id);
CREATE INDEX IF NOT EXISTS tool_outcomes_created_at_idx ON tool_outcomes(created_at);
CREATE INDEX IF NOT EXISTS tool_outcomes_project_idx ON tool_outcomes(project_id);

-- Session tool counter for periodic analysis
-- Tracks tool count and last analysis checkpoint for CAS-based analysis claiming
CREATE TABLE IF NOT EXISTS session_tool_counter (
  session_id TEXT PRIMARY KEY NOT NULL,
  tool_count INTEGER NOT NULL DEFAULT 0,
  last_analysis_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Migrate existing error_log data into tool_outcomes
-- LIMITATION: error_log is AGGREGATE (deduplicated), so this creates ONE row per unique error,
-- NOT per-occurrence. Historical sequence/recovery analysis will be incomplete for pre-migration data.
-- This is acceptable because:
--   1. New events going forward are per-occurrence
--   2. Historical aggregate data is still useful for error counts
--   3. Sequence analysis requires consecutive events (not possible to reconstruct)
INSERT INTO tool_outcomes (
  id, session_id, project_id, tool_name, outcome, outcome_type, message,
  tool_input_hash, analyzed, created_at
)
SELECT
  id, session_id, project_id, tool_name, 'failure', error_type, error_message,
  tool_input_hash, analyzed, created_at
FROM error_log;
