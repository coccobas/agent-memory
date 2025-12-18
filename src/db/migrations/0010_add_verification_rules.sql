-- Migration: Add verification rules to guidelines
-- This adds machine-readable verification rules for automated compliance checking

-- Add verification_rules column to guideline_versions table
ALTER TABLE guideline_versions ADD COLUMN verification_rules TEXT;
--> statement-breakpoint

-- Add verification tracking table for sessions
CREATE TABLE IF NOT EXISTS session_guideline_acknowledgments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  guideline_id TEXT NOT NULL REFERENCES guidelines(id) ON DELETE CASCADE,
  acknowledged_at TEXT NOT NULL DEFAULT (datetime('now')),
  acknowledged_by TEXT,
  UNIQUE(session_id, guideline_id)
);
--> statement-breakpoint

-- Add verification log table
CREATE TABLE IF NOT EXISTS verification_log (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL, -- 'pre_check', 'post_check', 'acknowledge'
  proposed_action TEXT, -- JSON: { type, description, filePath, content }
  result TEXT NOT NULL, -- JSON: { allowed, blocked, violations, warnings }
  guideline_ids TEXT, -- JSON array of checked guideline IDs
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);
--> statement-breakpoint

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_session_acknowledgments_session ON session_guideline_acknowledgments(session_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_verification_log_session ON verification_log(session_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_verification_log_action_type ON verification_log(action_type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_verification_log_created_at ON verification_log(created_at);
