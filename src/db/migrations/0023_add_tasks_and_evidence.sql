-- Migration: Add tasks and evidence tables
-- This migration introduces:
--   1. tasks table - for tracking work items, bugs, features, improvements, etc.
--   2. evidence table - for storing supporting artifacts like screenshots, logs, snippets, benchmarks
--   3. New relation types to link evidence to tasks and other entries:
--      - 'supports' - evidence supports a claim or task
--      - 'reproduces' - evidence reproduces an issue
--      - 'documents' - evidence documents behavior or decision
--      - 'child_of' - hierarchical parent-child relationship
--
-- The tasks table supports:
--   - Multiple task types (bug, feature, improvement, debt, research, question, other)
--   - Task domains (agent-executable vs physical/human tasks)
--   - Priority via severity + urgency matrix
--   - Status workflow (backlog -> open -> in_progress -> blocked/review -> done/wont_do)
--   - File location tracking for code-related tasks
--   - Parent-child task hierarchies via self-reference
--   - Blocking dependencies via blocked_by JSON array
--   - Time tracking (estimated vs actual minutes)
--
-- The evidence table supports:
--   - Multiple evidence types (screenshot, log, snippet, output, benchmark, link, document, quote, other)
--   - File attachments with metadata (path, name, mime_type, size, checksum)
--   - Code snippets with source file location
--   - Benchmark metrics with value, unit, and baseline comparison
--   - External links and quotes with source attribution

--------------------------------------------------------------------------------
-- TASKS TABLE
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'org', 'project', 'session')),
  scope_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('bug', 'feature', 'improvement', 'debt', 'research', 'question', 'other')) DEFAULT 'other',
  task_domain TEXT NOT NULL CHECK (task_domain IN ('agent', 'physical')) DEFAULT 'agent',
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',
  urgency TEXT NOT NULL CHECK (urgency IN ('immediate', 'soon', 'normal', 'later')) DEFAULT 'normal',
  category TEXT,
  status TEXT NOT NULL CHECK (status IN ('backlog', 'open', 'in_progress', 'blocked', 'review', 'done', 'wont_do')) DEFAULT 'open',
  resolution TEXT,
  file TEXT,
  start_line INTEGER,
  end_line INTEGER,
  assignee TEXT,
  reporter TEXT,
  parent_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  blocked_by TEXT,  -- JSON array of task IDs
  due_date TEXT,
  started_at TEXT,
  resolved_at TEXT,
  estimated_minutes INTEGER,
  actual_minutes INTEGER,
  tags TEXT,  -- JSON array
  metadata TEXT,  -- JSON object
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT,
  is_active INTEGER DEFAULT 1
);

-- Indexes for tasks table
-- Scope-based queries (most common access pattern)
CREATE INDEX IF NOT EXISTS idx_tasks_scope ON tasks(scope_type, scope_id);
-- Status filtering for workflow views
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
-- Type filtering for categorized views
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(task_type);
-- Domain filtering (agent vs physical tasks)
CREATE INDEX IF NOT EXISTS idx_tasks_domain ON tasks(task_domain);
-- Priority queries (severity + urgency for triage)
CREATE INDEX IF NOT EXISTS idx_tasks_severity ON tasks(severity);
CREATE INDEX IF NOT EXISTS idx_tasks_urgency ON tasks(urgency);
-- Active tasks filter
CREATE INDEX IF NOT EXISTS idx_tasks_active ON tasks(is_active);
-- Parent-child hierarchy traversal
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
-- Assignee workload queries
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);
-- Due date for deadline queries
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
-- Created date for timeline views
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);
-- File-based task lookup (find tasks for a file)
CREATE INDEX IF NOT EXISTS idx_tasks_file ON tasks(file);
-- Composite: scope + status for common filtered queries
CREATE INDEX IF NOT EXISTS idx_tasks_scope_status ON tasks(scope_type, scope_id, status);
-- Composite: scope + active for common filtered queries
CREATE INDEX IF NOT EXISTS idx_tasks_scope_active ON tasks(scope_type, scope_id, is_active);

--------------------------------------------------------------------------------
-- EVIDENCE TABLE
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'org', 'project', 'session')),
  scope_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('screenshot', 'log', 'snippet', 'output', 'benchmark', 'link', 'document', 'quote', 'other')),
  content TEXT,
  file_path TEXT,
  url TEXT,
  file_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  checksum TEXT,
  language TEXT,
  source_file TEXT,
  start_line INTEGER,
  end_line INTEGER,
  metric TEXT,
  value REAL,
  unit TEXT,
  baseline REAL,
  source TEXT,
  captured_at TEXT NOT NULL,
  captured_by TEXT,
  tags TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  is_active INTEGER DEFAULT 1
);

-- Indexes for evidence table
-- Scope-based queries (most common access pattern)
CREATE INDEX IF NOT EXISTS idx_evidence_scope ON evidence(scope_type, scope_id);
-- Type filtering for categorized views
CREATE INDEX IF NOT EXISTS idx_evidence_type ON evidence(evidence_type);
-- Active evidence filter
CREATE INDEX IF NOT EXISTS idx_evidence_active ON evidence(is_active);
-- Captured date for timeline views
CREATE INDEX IF NOT EXISTS idx_evidence_captured ON evidence(captured_at);
-- Created date for audit trail
CREATE INDEX IF NOT EXISTS idx_evidence_created ON evidence(created_at);
-- Source file lookup (find evidence for a file)
CREATE INDEX IF NOT EXISTS idx_evidence_source_file ON evidence(source_file);
-- Metric-based queries for benchmarks
CREATE INDEX IF NOT EXISTS idx_evidence_metric ON evidence(metric);
-- Composite: scope + type for common filtered queries
CREATE INDEX IF NOT EXISTS idx_evidence_scope_type ON evidence(scope_type, scope_id, evidence_type);
-- Composite: scope + active for common filtered queries
CREATE INDEX IF NOT EXISTS idx_evidence_scope_active ON evidence(scope_type, scope_id, is_active);

--------------------------------------------------------------------------------
-- RELATION TYPES EXTENSION
-- Note: The entry_relations table uses TEXT for relation_type without a CHECK
-- constraint in SQLite, so new relation types can be used directly:
--   - 'supports' - evidence supports a claim, decision, or task
--   - 'reproduces' - evidence reproduces an issue or bug
--   - 'documents' - evidence documents behavior, API, or decision rationale
--   - 'child_of' - hierarchical parent-child relationship (alternative to subtask_of)
--
-- These types complement existing types:
--   - 'applies_to', 'depends_on', 'conflicts_with', 'related_to'
--   - 'parent_task', 'subtask_of', 'promoted_to'
--
-- Usage examples:
--   evidence --supports--> task (screenshot proves bug exists)
--   evidence --reproduces--> task (log reproduces the issue)
--   evidence --documents--> knowledge (benchmark documents performance claim)
--   task --child_of--> task (subtask relationship)
--------------------------------------------------------------------------------
