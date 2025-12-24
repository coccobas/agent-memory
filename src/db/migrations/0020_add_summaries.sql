-- Migration 0020: Add hierarchical summaries
-- This migration creates tables to support multi-level memory consolidation through
-- hierarchical summaries. Summaries enable efficient semantic search and retrieval
-- by organizing memory entries into progressively higher-level abstractions.

-- =============================================================================
-- SUMMARIES TABLE
-- Hierarchical memory consolidation at three levels
-- =============================================================================

CREATE TABLE IF NOT EXISTS summaries (
    id TEXT PRIMARY KEY NOT NULL,

    -- Scope - where this summary belongs
    scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'org', 'project', 'session')),
    scope_id TEXT,

    -- Hierarchy configuration
    hierarchy_level INTEGER NOT NULL CHECK (hierarchy_level IN (0, 1, 2)),
    parent_summary_id TEXT,

    -- Identity and content
    title TEXT NOT NULL,
    content TEXT NOT NULL,

    -- Metrics
    member_count INTEGER NOT NULL DEFAULT 0,

    -- Embeddings for semantic search (stored as JSON array)
    embedding TEXT, -- JSON array of numbers
    embedding_dimension INTEGER,

    -- Quality metrics
    coherence_score REAL, -- How well members relate (0.0-1.0)
    compression_ratio REAL, -- Summary length / total member content length

    -- Lifecycle flags
    is_active INTEGER NOT NULL DEFAULT 1,
    needs_regeneration INTEGER NOT NULL DEFAULT 0,

    -- Audit timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by TEXT,

    -- Access tracking
    last_accessed_at TEXT,
    access_count INTEGER NOT NULL DEFAULT 0,

    -- Self-referential foreign key for hierarchy
    FOREIGN KEY (parent_summary_id) REFERENCES summaries(id) ON DELETE SET NULL

    -- Note: scope_id foreign keys are not enforced since scope_id can reference
    -- different tables (orgs, projects, sessions) depending on scope_type.
    -- Application logic ensures referential integrity.
);

-- =============================================================================
-- SUMMARY MEMBERS TABLE
-- Many-to-many relationship between summaries and their members
-- =============================================================================

CREATE TABLE IF NOT EXISTS summary_members (
    id TEXT PRIMARY KEY NOT NULL,

    -- References
    summary_id TEXT NOT NULL,
    member_type TEXT NOT NULL CHECK (member_type IN ('tool', 'guideline', 'knowledge', 'experience', 'summary')),
    member_id TEXT NOT NULL,

    -- Metrics
    contribution_score REAL, -- Importance of this member to the summary (0.0-1.0)

    -- Ordering for stable presentation
    display_order INTEGER,

    -- Audit
    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- Foreign key to summary
    FOREIGN KEY (summary_id) REFERENCES summaries(id) ON DELETE CASCADE
);

-- =============================================================================
-- INDEXES FOR SUMMARIES
-- =============================================================================

-- Scope lookup - find summaries in a specific scope
CREATE INDEX IF NOT EXISTS idx_summaries_scope
    ON summaries(scope_type, scope_id);

-- Hierarchy navigation - find summaries by level
CREATE INDEX IF NOT EXISTS idx_summaries_level
    ON summaries(hierarchy_level);

-- Parent-child relationships - find children of a summary
CREATE INDEX IF NOT EXISTS idx_summaries_parent
    ON summaries(parent_summary_id);

-- Active status filtering - efficiently query active summaries
CREATE INDEX IF NOT EXISTS idx_summaries_active
    ON summaries(is_active);

-- Regeneration queue - find summaries that need updating
CREATE INDEX IF NOT EXISTS idx_summaries_needs_regen
    ON summaries(needs_regeneration)
    WHERE needs_regeneration = 1;

-- Access tracking - identify frequently/recently accessed summaries
CREATE INDEX IF NOT EXISTS idx_summaries_accessed
    ON summaries(last_accessed_at DESC);

-- Composite index for scope + level queries (common access pattern)
CREATE INDEX IF NOT EXISTS idx_summaries_scope_level
    ON summaries(scope_type, scope_id, hierarchy_level);

-- Updated timestamp index for finding recently modified summaries
CREATE INDEX IF NOT EXISTS idx_summaries_updated
    ON summaries(updated_at DESC);

-- =============================================================================
-- INDEXES FOR SUMMARY MEMBERS
-- =============================================================================

-- Summary lookup - find all members of a summary (with ordering)
CREATE INDEX IF NOT EXISTS idx_summary_members_summary
    ON summary_members(summary_id, display_order);

-- Member lookup - find all summaries containing a specific member
CREATE INDEX IF NOT EXISTS idx_summary_members_member
    ON summary_members(member_type, member_id);

-- Contribution scoring - find high-value members
CREATE INDEX IF NOT EXISTS idx_summary_members_contribution
    ON summary_members(summary_id, contribution_score DESC);

-- Uniqueness constraint - a member can only appear once per summary
CREATE UNIQUE INDEX IF NOT EXISTS idx_summary_members_unique
    ON summary_members(summary_id, member_type, member_id);

-- =============================================================================
-- TRIGGERS FOR AUTOMATIC MAINTENANCE
-- =============================================================================

-- Update summary updated_at timestamp when modified
CREATE TRIGGER IF NOT EXISTS trg_summaries_updated_at
    AFTER UPDATE ON summaries
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE summaries
    SET updated_at = datetime('now')
    WHERE id = NEW.id;
END;

-- Update member_count when members are added
CREATE TRIGGER IF NOT EXISTS trg_summary_members_insert_count
    AFTER INSERT ON summary_members
    FOR EACH ROW
BEGIN
    UPDATE summaries
    SET member_count = member_count + 1,
        updated_at = datetime('now')
    WHERE id = NEW.summary_id;
END;

-- Update member_count when members are removed
CREATE TRIGGER IF NOT EXISTS trg_summary_members_delete_count
    AFTER DELETE ON summary_members
    FOR EACH ROW
BEGIN
    UPDATE summaries
    SET member_count = member_count - 1,
        updated_at = datetime('now')
    WHERE id = OLD.summary_id;
END;

-- Mark parent summaries as needing regeneration when children are modified
CREATE TRIGGER IF NOT EXISTS trg_summaries_mark_parent_dirty
    AFTER UPDATE ON summaries
    FOR EACH ROW
    WHEN NEW.content != OLD.content AND NEW.parent_summary_id IS NOT NULL
BEGIN
    UPDATE summaries
    SET needs_regeneration = 1,
        updated_at = datetime('now')
    WHERE id = NEW.parent_summary_id;
END;

-- =============================================================================
-- NOTES
-- =============================================================================
-- Hierarchy Levels:
--   0 (Chunk): Small groups of 5-10 related entries
--   1 (Topic): Collections of 3-5 related chunks
--   2 (Domain): High-level summaries of entire categories
--
-- Member Types:
--   - tool: Reference to tools table
--   - guideline: Reference to guidelines table
--   - knowledge: Reference to knowledge table
--   - experience: Reference to experiences table
--   - summary: Reference to other summaries (for hierarchical composition)
--
-- Embeddings:
--   - Stored as JSON arrays to maintain flexibility across models
--   - Used for semantic similarity search across summaries
--   - Can be generated from summary content using embedding service
--
-- Quality Metrics:
--   - coherence_score: Measures semantic coherence of members
--   - compression_ratio: Efficiency of summary vs original content
--   - contribution_score: Individual member importance to summary
--
-- Lifecycle Management:
--   - needs_regeneration flag marks summaries for refresh
--   - Triggers automatically mark parent summaries dirty when children change
--   - Access tracking supports usage-based prioritization
--
-- Foreign Key Behavior:
--   - Cascade delete: When a summary is deleted, its members are removed
--   - Set null: When a parent summary is deleted, children become orphans
--   - Scope deletion cascades to all summaries in that scope
