-- Add 'topic' to v2_scopes type constraint, add scope embedding, add transcript topic link.
--
-- SQLite does not support ALTER CHECK, so we rebuild v2_scopes with the widened constraint.
-- FK enforcement is disabled during the rebuild to avoid RESTRICT violations from v2_entries.

PRAGMA foreign_keys = OFF;

-- 1. Rebuild v2_scopes with 'topic' added to the type CHECK constraint
CREATE TABLE v2_scopes_new (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('global', 'org', 'project', 'session', 'topic')),
  parent_scope_id TEXT REFERENCES v2_scopes_new(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  label TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO v2_scopes_new (id, type, parent_scope_id, name, label, is_archived, metadata, created_at, updated_at)
  SELECT id, type, parent_scope_id, name, label, is_archived, metadata, created_at, updated_at
  FROM v2_scopes;

DROP TABLE v2_scopes;
ALTER TABLE v2_scopes_new RENAME TO v2_scopes;

-- Re-create indexes (from migrations 0044 + 0045)
CREATE INDEX IF NOT EXISTS idx_v2_scopes_type ON v2_scopes(type);
CREATE INDEX IF NOT EXISTS idx_v2_scopes_parent ON v2_scopes(parent_scope_id);
CREATE INDEX IF NOT EXISTS idx_v2_scopes_archived ON v2_scopes(is_archived);

PRAGMA foreign_keys = ON;

-- 2. Add embedding column to v2_scopes for topic centroid vectors
ALTER TABLE v2_scopes ADD COLUMN embedding BLOB;

-- 3. Add topic assignment columns to v2_transcripts
ALTER TABLE v2_transcripts ADD COLUMN topic_scope_id TEXT REFERENCES v2_scopes(id);
ALTER TABLE v2_transcripts ADD COLUMN topic_assignment TEXT CHECK (topic_assignment IN ('auto', 'manual'));

CREATE INDEX IF NOT EXISTS idx_v2_transcripts_topic ON v2_transcripts(topic_scope_id);
