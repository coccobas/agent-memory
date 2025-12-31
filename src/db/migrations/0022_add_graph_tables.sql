-- Migration: Add flexible knowledge graph tables
-- This adds support for user-defined node and edge types with property graph model

-- Dynamic node type definitions (replaces hardcoded entry types)
CREATE TABLE IF NOT EXISTS node_types (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  schema TEXT NOT NULL DEFAULT '{}',
  description TEXT,
  parent_type_id TEXT REFERENCES node_types(id),
  is_builtin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT
);

-- Dynamic edge type definitions (replaces hardcoded relation types)
CREATE TABLE IF NOT EXISTS edge_types (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  schema TEXT DEFAULT '{}',
  description TEXT,
  is_directed INTEGER DEFAULT 1,
  inverse_name TEXT,
  source_constraints TEXT,
  target_constraints TEXT,
  is_builtin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT
);

-- Unified node table for ALL entity types
CREATE TABLE IF NOT EXISTS nodes (
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
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Append-only version history for nodes
CREATE TABLE IF NOT EXISTS node_versions (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  version_num INTEGER NOT NULL,
  properties TEXT NOT NULL,
  change_reason TEXT,
  valid_from TEXT,
  valid_until TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT
);

-- Unified edge table for ALL relationships
CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  edge_type_id TEXT NOT NULL REFERENCES edge_types(id),
  source_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  properties TEXT DEFAULT '{}',
  weight REAL DEFAULT 1.0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT
);

-- Tag associations for nodes
CREATE TABLE IF NOT EXISTS node_tags (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(node_id, tag_id)
);

-- Embedding tracking for nodes
CREATE TABLE IF NOT EXISTS node_embeddings (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL,
  has_embedding INTEGER DEFAULT 0,
  embedding_model TEXT,
  embedding_provider TEXT CHECK (embedding_provider IN ('openai', 'local', 'disabled')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(node_id, version_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(node_type_id);
CREATE INDEX IF NOT EXISTS idx_nodes_scope ON nodes(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
CREATE INDEX IF NOT EXISTS idx_nodes_active ON nodes(is_active);
CREATE INDEX IF NOT EXISTS idx_nodes_created ON nodes(created_at);

CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(edge_type_id);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_edges_source_type ON edges(source_id, edge_type_id);
CREATE INDEX IF NOT EXISTS idx_edges_target_type ON edges(target_id, edge_type_id);

CREATE INDEX IF NOT EXISTS idx_node_versions_node ON node_versions(node_id);
CREATE INDEX IF NOT EXISTS idx_node_versions_num ON node_versions(node_id, version_num);

CREATE INDEX IF NOT EXISTS idx_node_tags_node ON node_tags(node_id);
CREATE INDEX IF NOT EXISTS idx_node_tags_tag ON node_tags(tag_id);

CREATE INDEX IF NOT EXISTS idx_node_embeddings_node ON node_embeddings(node_id);
CREATE INDEX IF NOT EXISTS idx_node_embeddings_status ON node_embeddings(has_embedding);
