-- Migration 0002: Add Embeddings Tracking Table
-- Tracks which entries have embeddings generated

CREATE TABLE entry_embeddings (
    id text PRIMARY KEY,
    entry_type text NOT NULL,
    entry_id text NOT NULL,
    version_id text NOT NULL,
    has_embedding boolean DEFAULT false NOT NULL,
    embedding_model text,
    embedding_provider text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entry_embeddings_entry_type_check CHECK (entry_type IN ('tool', 'guideline', 'knowledge')),
    CONSTRAINT entry_embeddings_provider_check CHECK (embedding_provider IS NULL OR embedding_provider IN ('openai', 'local', 'disabled'))
);

CREATE INDEX idx_entry_embeddings_entry ON entry_embeddings(entry_type, entry_id);
CREATE INDEX idx_entry_embeddings_status ON entry_embeddings(has_embedding);
CREATE UNIQUE INDEX idx_entry_embeddings_version ON entry_embeddings(entry_type, entry_id, version_id);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at on entry_embeddings
CREATE TRIGGER update_entry_embeddings_updated_at
    BEFORE UPDATE ON entry_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
