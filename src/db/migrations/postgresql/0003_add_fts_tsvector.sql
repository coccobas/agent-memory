-- Migration 0003: Add PostgreSQL Full-Text Search with tsvector
-- Replaces SQLite FTS5 with native PostgreSQL tsvector + GIN indexes

-- =============================================================================
-- ADD TSVECTOR COLUMNS
-- =============================================================================

-- Add search_vector column to tools
ALTER TABLE tools ADD COLUMN search_vector tsvector;

-- Add search_vector column to guidelines
ALTER TABLE guidelines ADD COLUMN search_vector tsvector;

-- Add search_vector column to knowledge
ALTER TABLE knowledge ADD COLUMN search_vector tsvector;

-- =============================================================================
-- CREATE GIN INDEXES
-- =============================================================================

CREATE INDEX idx_tools_search ON tools USING gin(search_vector);
CREATE INDEX idx_guidelines_search ON guidelines USING gin(search_vector);
CREATE INDEX idx_knowledge_search ON knowledge USING gin(search_vector);

-- =============================================================================
-- TRIGGER FUNCTIONS
-- =============================================================================

-- Function to update tools search vector
CREATE OR REPLACE FUNCTION tools_search_vector_update() RETURNS TRIGGER AS $$
DECLARE
    desc_text text;
BEGIN
    -- Get description from current version
    SELECT description INTO desc_text
    FROM tool_versions
    WHERE id = NEW.current_version_id;

    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(desc_text, '')), 'B');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update guidelines search vector
CREATE OR REPLACE FUNCTION guidelines_search_vector_update() RETURNS TRIGGER AS $$
DECLARE
    content_text text;
    rationale_text text;
BEGIN
    -- Get content and rationale from current version
    SELECT content, rationale INTO content_text, rationale_text
    FROM guideline_versions
    WHERE id = NEW.current_version_id;

    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(content_text, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(rationale_text, '')), 'C');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update knowledge search vector
CREATE OR REPLACE FUNCTION knowledge_search_vector_update() RETURNS TRIGGER AS $$
DECLARE
    content_text text;
    source_text text;
BEGIN
    -- Get content and source from current version
    SELECT content, source INTO content_text, source_text
    FROM knowledge_versions
    WHERE id = NEW.current_version_id;

    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(content_text, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(source_text, '')), 'C');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- CREATE TRIGGERS
-- =============================================================================

-- Trigger for tools
CREATE TRIGGER tools_search_vector_trigger
    BEFORE INSERT OR UPDATE OF name, current_version_id ON tools
    FOR EACH ROW
    EXECUTE FUNCTION tools_search_vector_update();

-- Trigger for guidelines
CREATE TRIGGER guidelines_search_vector_trigger
    BEFORE INSERT OR UPDATE OF name, current_version_id ON guidelines
    FOR EACH ROW
    EXECUTE FUNCTION guidelines_search_vector_update();

-- Trigger for knowledge
CREATE TRIGGER knowledge_search_vector_trigger
    BEFORE INSERT OR UPDATE OF title, current_version_id ON knowledge
    FOR EACH ROW
    EXECUTE FUNCTION knowledge_search_vector_update();

-- =============================================================================
-- VERSION UPDATE TRIGGERS
-- Need to also update search vectors when version content changes
-- =============================================================================

-- Function to refresh tool search vector when version is updated
CREATE OR REPLACE FUNCTION tool_version_update_search() RETURNS TRIGGER AS $$
BEGIN
    UPDATE tools
    SET search_vector =
        setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B')
    WHERE current_version_id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to refresh guideline search vector when version is updated
CREATE OR REPLACE FUNCTION guideline_version_update_search() RETURNS TRIGGER AS $$
BEGIN
    UPDATE guidelines
    SET search_vector =
        setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.rationale, '')), 'C')
    WHERE current_version_id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to refresh knowledge search vector when version is updated
CREATE OR REPLACE FUNCTION knowledge_version_update_search() RETURNS TRIGGER AS $$
BEGIN
    UPDATE knowledge
    SET search_vector =
        setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.source, '')), 'C')
    WHERE current_version_id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for version updates
CREATE TRIGGER tool_versions_search_trigger
    AFTER UPDATE OF description ON tool_versions
    FOR EACH ROW
    EXECUTE FUNCTION tool_version_update_search();

CREATE TRIGGER guideline_versions_search_trigger
    AFTER UPDATE OF content, rationale ON guideline_versions
    FOR EACH ROW
    EXECUTE FUNCTION guideline_version_update_search();

CREATE TRIGGER knowledge_versions_search_trigger
    AFTER UPDATE OF content, source ON knowledge_versions
    FOR EACH ROW
    EXECUTE FUNCTION knowledge_version_update_search();

-- =============================================================================
-- POPULATE EXISTING DATA
-- =============================================================================

-- Update search vectors for existing tools
UPDATE tools t
SET search_vector =
    setweight(to_tsvector('english', COALESCE(t.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(tv.description, '')), 'B')
FROM tool_versions tv
WHERE t.current_version_id = tv.id AND t.is_active = true;

-- Update search vectors for existing guidelines
UPDATE guidelines g
SET search_vector =
    setweight(to_tsvector('english', COALESCE(g.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(gv.content, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(gv.rationale, '')), 'C')
FROM guideline_versions gv
WHERE g.current_version_id = gv.id AND g.is_active = true;

-- Update search vectors for existing knowledge
UPDATE knowledge k
SET search_vector =
    setweight(to_tsvector('english', COALESCE(k.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(kv.content, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(kv.source, '')), 'C')
FROM knowledge_versions kv
WHERE k.current_version_id = kv.id AND k.is_active = true;
