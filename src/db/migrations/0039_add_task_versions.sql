-- Migration: Add task_versions table for version history tracking
-- This migration introduces:
--   1. task_versions table - append-only version history for tasks
--   2. current_version_id column on tasks table - reference to latest version
--
-- The task_versions table captures mutable content fields:
--   - title, description, status, resolution, metadata
--
-- This enables:
--   - Complete audit trail of task changes
--   - Conflict detection and resolution
--   - Temporal queries ("what was the status on date X?")
--   - Rollback capability

--------------------------------------------------------------------------------
-- TASK_VERSIONS TABLE
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS task_versions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  version_num INTEGER NOT NULL,
  title TEXT,
  description TEXT,
  status TEXT CHECK (status IN ('backlog', 'open', 'in_progress', 'blocked', 'review', 'done', 'wont_do')),
  resolution TEXT,
  metadata TEXT,  -- JSON object
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by TEXT,
  change_reason TEXT,
  conflict_flag INTEGER DEFAULT 0 NOT NULL
);

-- Indexes for task_versions table
-- Task lookup - find all versions of a task
CREATE INDEX IF NOT EXISTS idx_task_versions_task ON task_versions(task_id);
-- Unique constraint - one version number per task
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_versions_unique ON task_versions(task_id, version_num);
-- Created date for timeline views
CREATE INDEX IF NOT EXISTS idx_task_versions_created ON task_versions(created_at);
-- Conflict detection queries
CREATE INDEX IF NOT EXISTS idx_task_versions_conflict ON task_versions(conflict_flag);

--------------------------------------------------------------------------------
-- TASKS TABLE MODIFICATION
--------------------------------------------------------------------------------

-- Add current_version_id column to tasks table
ALTER TABLE tasks ADD COLUMN current_version_id TEXT REFERENCES task_versions(id) ON DELETE SET NULL;

-- Index for version lookup
CREATE INDEX IF NOT EXISTS idx_tasks_current_version ON tasks(current_version_id);
