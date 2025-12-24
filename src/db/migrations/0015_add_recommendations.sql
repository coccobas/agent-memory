-- Migration: Add recommendations tables for Librarian Agent
-- This migration creates tables for storing librarian-generated promotion recommendations

-- =============================================================================
-- RECOMMENDATIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS recommendations (
    id TEXT PRIMARY KEY NOT NULL,
    scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'org', 'project', 'session')),
    scope_id TEXT,

    -- Type of recommendation
    type TEXT NOT NULL CHECK (type IN ('strategy', 'skill')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'skipped', 'expired')),

    -- Generated content
    title TEXT NOT NULL,
    pattern TEXT,
    applicability TEXT,
    contraindications TEXT,
    rationale TEXT,

    -- Confidence and metrics
    confidence REAL NOT NULL DEFAULT 0.5,
    pattern_count INTEGER NOT NULL DEFAULT 1,
    exemplar_experience_id TEXT REFERENCES experiences(id) ON DELETE SET NULL,

    -- Source experiences (JSON array of IDs)
    source_experience_ids TEXT NOT NULL,

    -- Result of approval
    promoted_experience_id TEXT REFERENCES experiences(id) ON DELETE SET NULL,
    promoted_tool_id TEXT,

    -- Review metadata
    reviewed_at TEXT,
    reviewed_by TEXT,
    review_notes TEXT,

    -- Analysis metadata
    analysis_run_id TEXT,
    analysis_version TEXT,

    -- Lifecycle
    expires_at TEXT,

    -- Audit
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for recommendations
CREATE INDEX IF NOT EXISTS idx_recommendations_scope ON recommendations(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_status ON recommendations(status);
CREATE INDEX IF NOT EXISTS idx_recommendations_type ON recommendations(type);
CREATE INDEX IF NOT EXISTS idx_recommendations_confidence ON recommendations(confidence);
CREATE INDEX IF NOT EXISTS idx_recommendations_created ON recommendations(created_at);
CREATE INDEX IF NOT EXISTS idx_recommendations_expires ON recommendations(expires_at);

-- =============================================================================
-- RECOMMENDATION SOURCES TABLE (many-to-many link)
-- =============================================================================

CREATE TABLE IF NOT EXISTS recommendation_sources (
    id TEXT PRIMARY KEY NOT NULL,
    recommendation_id TEXT NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
    experience_id TEXT NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,

    -- Role in the pattern
    is_exemplar INTEGER NOT NULL DEFAULT 0,
    similarity_score REAL,

    -- Audit
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for recommendation sources
CREATE INDEX IF NOT EXISTS idx_rec_sources_recommendation ON recommendation_sources(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_rec_sources_experience ON recommendation_sources(experience_id);
