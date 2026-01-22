-- Migration 0032: Add maintenance_jobs table
-- Persists librarian maintenance jobs to survive process restarts and context clears.
-- Enables job status queries across sessions and provides audit trail.

CREATE TABLE IF NOT EXISTS maintenance_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  
  request_scope_type TEXT NOT NULL CHECK (request_scope_type IN ('global', 'org', 'project', 'session')),
  request_scope_id TEXT,
  request_tasks TEXT,
  request_dry_run INTEGER DEFAULT 0,
  request_initiated_by TEXT,
  request_config_overrides TEXT,
  
  progress TEXT,
  result TEXT,
  error TEXT,
  
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  started_at TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_maintenance_jobs_status ON maintenance_jobs(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_jobs_scope ON maintenance_jobs(request_scope_type, request_scope_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_jobs_created_at ON maintenance_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_jobs_scope_status ON maintenance_jobs(request_scope_type, request_scope_id, status);
