-- Add vector storage and scope admin columns to V2 schema

-- Vector storage for semantic search
ALTER TABLE v2_entry_embeddings ADD COLUMN embedding BLOB;
ALTER TABLE v2_entry_embeddings ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_v2_entry_embeddings_status ON v2_entry_embeddings(status);

-- Scope admin lifecycle columns
ALTER TABLE v2_scopes ADD COLUMN label TEXT;
ALTER TABLE v2_scopes ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_v2_scopes_archived ON v2_scopes(is_archived);
