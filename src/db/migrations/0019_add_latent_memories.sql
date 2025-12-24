-- Migration 0019: Add latent memories table for compressed embeddings
-- This migration creates a table to store pre-computed embeddings (full and compressed)
-- for memory entries, enabling efficient semantic search without recomputing embeddings.

-- =============================================================================
-- LATENT MEMORIES TABLE
-- Store full and reduced-dimension embeddings for semantic search
-- =============================================================================

CREATE TABLE IF NOT EXISTS latent_memories (
    id TEXT PRIMARY KEY NOT NULL,

    -- Source reference
    source_type TEXT NOT NULL CHECK (source_type IN ('tool', 'guideline', 'knowledge', 'experience', 'conversation')),
    source_id TEXT NOT NULL,
    source_version_id TEXT,

    -- Embeddings (stored as JSON arrays of numbers)
    full_embedding TEXT NOT NULL,
    reduced_embedding TEXT,

    -- Embedding dimensions
    full_dimension INTEGER NOT NULL,
    reduced_dimension INTEGER,

    -- Compression method used
    compression_method TEXT NOT NULL DEFAULT 'none' CHECK (compression_method IN ('pca', 'random_projection', 'quantized', 'none')),

    -- Text preview for debugging and display (first 200 chars)
    text_preview TEXT,

    -- Importance/relevance scoring
    importance_score REAL NOT NULL DEFAULT 0.5,

    -- Optional session scoping for temporary embeddings
    session_id TEXT,

    -- TTL support for ephemeral embeddings
    expires_at TEXT,

    -- Audit and access tracking
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
    access_count INTEGER NOT NULL DEFAULT 0,

    -- Active flag for soft deletion
    is_active INTEGER NOT NULL DEFAULT 1,

    -- Foreign key to sessions (if scoped)
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- =============================================================================
-- INDEXES FOR LATENT MEMORIES
-- =============================================================================

-- Source lookup - find embeddings for a specific memory entry
CREATE INDEX IF NOT EXISTS idx_latent_memories_source
    ON latent_memories(source_type, source_id);

-- Session scoping - retrieve session-specific embeddings
CREATE INDEX IF NOT EXISTS idx_latent_memories_session
    ON latent_memories(session_id);

-- Importance-based retrieval - prioritize high-importance memories
CREATE INDEX IF NOT EXISTS idx_latent_memories_importance
    ON latent_memories(importance_score DESC);

-- Access tracking - identify frequently/recently accessed embeddings
CREATE INDEX IF NOT EXISTS idx_latent_memories_accessed
    ON latent_memories(last_accessed_at DESC);

-- Active status filtering - efficiently query active embeddings
CREATE INDEX IF NOT EXISTS idx_latent_memories_active
    ON latent_memories(is_active);

-- TTL cleanup - efficiently find expired embeddings for cleanup
CREATE INDEX IF NOT EXISTS idx_latent_memories_expires
    ON latent_memories(expires_at);

-- Uniqueness constraint - one embedding per source version
-- This ensures we don't duplicate embeddings for the same content
CREATE UNIQUE INDEX IF NOT EXISTS idx_latent_memories_unique
    ON latent_memories(source_type, source_id, source_version_id);

-- =============================================================================
-- NOTES
-- =============================================================================
-- 1. Embeddings are stored as JSON arrays to maintain flexibility across
--    different embedding models and dimensions
-- 2. Reduced embeddings use dimensionality reduction (PCA, random projection, etc.)
--    for faster similarity search with acceptable accuracy trade-off
-- 3. importance_score can be used for weighted retrieval or filtering
-- 4. expires_at enables automatic cleanup of temporary session embeddings
-- 5. Access tracking (last_accessed_at, access_count) supports LRU eviction
-- 6. The unique index on (source_type, source_id, source_version_id) ensures
--    embeddings are updated when content changes rather than duplicated
