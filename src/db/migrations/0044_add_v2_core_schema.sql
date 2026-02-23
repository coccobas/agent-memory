-- V2 clean rewrite baseline schema

-- scopes
CREATE TABLE IF NOT EXISTS v2_scopes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('global', 'org', 'project', 'session')),
  parent_scope_id TEXT REFERENCES v2_scopes(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_v2_scopes_type ON v2_scopes(type);
CREATE INDEX IF NOT EXISTS idx_v2_scopes_parent ON v2_scopes(parent_scope_id);

-- entries
CREATE TABLE IF NOT EXISTS v2_entries (
  id TEXT PRIMARY KEY,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('guideline', 'knowledge', 'tool', 'experience')),
  scope_id TEXT NOT NULL REFERENCES v2_scopes(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  category TEXT,
  priority INTEGER,
  source TEXT NOT NULL,
  confidence REAL,
  current_version INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_v2_entries_scope ON v2_entries(scope_id);
CREATE INDEX IF NOT EXISTS idx_v2_entries_type ON v2_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_v2_entries_active ON v2_entries(is_active);
CREATE INDEX IF NOT EXISTS idx_v2_entries_updated_at ON v2_entries(updated_at DESC);

-- append-only versions
CREATE TABLE IF NOT EXISTS v2_entry_versions (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES v2_entries(id) ON DELETE CASCADE,
  version_num INTEGER NOT NULL,
  content TEXT NOT NULL,
  facets_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  UNIQUE(entry_id, version_num)
);

CREATE INDEX IF NOT EXISTS idx_v2_entry_versions_entry ON v2_entry_versions(entry_id, version_num DESC);

-- tags
CREATE TABLE IF NOT EXISTS v2_tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS v2_entry_tags (
  entry_id TEXT NOT NULL REFERENCES v2_entries(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES v2_tags(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(entry_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_v2_entry_tags_tag ON v2_entry_tags(tag_id);

-- relations
CREATE TABLE IF NOT EXISTS v2_relations (
  id TEXT PRIMARY KEY,
  source_entry_id TEXT NOT NULL REFERENCES v2_entries(id) ON DELETE CASCADE,
  target_entry_id TEXT NOT NULL REFERENCES v2_entries(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  updated_by TEXT,
  UNIQUE(source_entry_id, target_entry_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_v2_relations_source ON v2_relations(source_entry_id);
CREATE INDEX IF NOT EXISTS idx_v2_relations_target ON v2_relations(target_entry_id);

-- transactional outbox
CREATE TABLE IF NOT EXISTS v2_outbox_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  correlation_id TEXT,
  payload_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_v2_outbox_events_seq ON v2_outbox_events(seq);
CREATE INDEX IF NOT EXISTS idx_v2_outbox_events_occurred_at ON v2_outbox_events(occurred_at);

-- projector idempotency and progress
CREATE TABLE IF NOT EXISTS v2_projector_receipts (
  projector_name TEXT NOT NULL,
  event_id TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(projector_name, event_id)
);

CREATE INDEX IF NOT EXISTS idx_v2_projector_receipts_event ON v2_projector_receipts(event_id);

CREATE TABLE IF NOT EXISTS v2_projector_checkpoints (
  projector_name TEXT PRIMARY KEY,
  last_seq INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- FTS projection
CREATE VIRTUAL TABLE IF NOT EXISTS v2_entry_fts USING fts5(
  entry_id UNINDEXED,
  title,
  content,
  facets
);

-- semantic projection metadata
CREATE TABLE IF NOT EXISTS v2_entry_embeddings (
  entry_id TEXT PRIMARY KEY REFERENCES v2_entries(id) ON DELETE CASCADE,
  embedding_model TEXT,
  embedding_dim INTEGER,
  content_hash TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_v2_entry_embeddings_hash ON v2_entry_embeddings(content_hash);

-- entity projection (prepared in V1 for expansion)
CREATE TABLE IF NOT EXISTS v2_entity_index (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES v2_entries(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_value TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entry_id, entity_type, entity_value)
);

CREATE INDEX IF NOT EXISTS idx_v2_entity_index_entry ON v2_entity_index(entry_id);
CREATE INDEX IF NOT EXISTS idx_v2_entity_index_lookup ON v2_entity_index(entity_type, entity_value);
