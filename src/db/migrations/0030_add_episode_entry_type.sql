-- Migration: Add 'episode' to entry_type CHECK constraint on nodes table
-- SQLite doesn't support ALTER CONSTRAINT, so we need to recreate the table

PRAGMA foreign_keys=OFF;

-- Create new nodes table with updated constraint (matching actual schema exactly)
CREATE TABLE nodes_new (
  id TEXT PRIMARY KEY,
  node_type_id TEXT NOT NULL REFERENCES node_types(id),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'org', 'project', 'session')),
  scope_id TEXT,
  name TEXT NOT NULL,
  properties TEXT NOT NULL DEFAULT '{}',
  current_version_id TEXT,
  is_active INTEGER DEFAULT 1,
  last_accessed_at TEXT,
  access_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  entry_id TEXT,
  entry_type TEXT CHECK (entry_type IN ('knowledge', 'guideline', 'tool', 'experience', 'task', 'episode') OR entry_type IS NULL)
);

-- Copy data from old table
INSERT INTO nodes_new SELECT * FROM nodes;

-- Drop old table
DROP TABLE nodes;

-- Rename new table
ALTER TABLE nodes_new RENAME TO nodes;

-- Recreate indexes (matching actual schema)
CREATE INDEX idx_nodes_type ON nodes(node_type_id);
CREATE INDEX idx_nodes_scope ON nodes(scope_type, scope_id);
CREATE INDEX idx_nodes_name ON nodes(name);
CREATE INDEX idx_nodes_active ON nodes(is_active);
CREATE INDEX idx_nodes_created ON nodes(created_at);
CREATE INDEX idx_nodes_entry ON nodes(entry_type, entry_id);
CREATE UNIQUE INDEX idx_nodes_entry_unique ON nodes(entry_type, entry_id) WHERE entry_id IS NOT NULL;

PRAGMA foreign_keys=ON;
