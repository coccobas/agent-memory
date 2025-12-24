-- Migration 0012: Add pgvector support for vector embeddings
-- Enables vector similarity search directly in PostgreSQL

-- Enable pgvector extension (requires superuser or extension was pre-created)
CREATE EXTENSION IF NOT EXISTS vector;

-- Vector embeddings table - stores actual embedding vectors
CREATE TABLE vector_embeddings (
    id text PRIMARY KEY,
    entry_type text NOT NULL,
    entry_id text NOT NULL,
    version_id text NOT NULL,
    text text NOT NULL,
    embedding vector NOT NULL,
    model text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vector_embeddings_entry_type_check CHECK (entry_type IN ('tool', 'guideline', 'knowledge', 'experience'))
);

-- Standard indexes for filtering
CREATE INDEX idx_vector_embeddings_entry ON vector_embeddings(entry_type, entry_id);
CREATE INDEX idx_vector_embeddings_type ON vector_embeddings(entry_type);

-- Unique constraint to prevent duplicate versions
CREATE UNIQUE INDEX uq_vector_entry_version ON vector_embeddings(entry_type, entry_id, version_id);

-- Meta table for tracking vector configuration (e.g., dimension)
CREATE TABLE _vector_meta (
    key text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);

-- Note: HNSW index is created dynamically on first embedding insertion
-- when the dimension is known. See PgVectorStore.createHnswIndex()
