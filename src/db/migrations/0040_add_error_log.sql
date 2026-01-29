-- Migration 0040: Add error_log table for error tracking and deduplication
-- Stores errors with hash-based deduplication to track error patterns

CREATE TABLE IF NOT EXISTS error_log (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  project_id TEXT,
  tool_name TEXT NOT NULL,
  error_type TEXT NOT NULL,
  error_message TEXT,
  error_signature TEXT NOT NULL,
  occurrence_count INTEGER DEFAULT 1 NOT NULL,
  first_occurrence TEXT NOT NULL,
  last_occurrence TEXT NOT NULL,
  tool_input_hash TEXT,
  analyzed INTEGER DEFAULT 0 NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE(error_signature, session_id)
);

CREATE INDEX IF NOT EXISTS idx_error_log_session ON error_log(session_id);
CREATE INDEX IF NOT EXISTS idx_error_log_project ON error_log(project_id);
CREATE INDEX IF NOT EXISTS idx_error_log_signature ON error_log(error_signature);
CREATE INDEX IF NOT EXISTS idx_error_log_analyzed ON error_log(analyzed);
CREATE INDEX IF NOT EXISTS idx_error_log_session_signature ON error_log(session_id, error_signature);
