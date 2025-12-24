-- Migration 0011: Add Performance Indexes
-- Additional indexes for query optimization

-- Active entries by scope (common query pattern)
CREATE INDEX IF NOT EXISTS idx_tools_active_scope ON tools(scope_type, scope_id)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_guidelines_active_scope ON guidelines(scope_type, scope_id)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_knowledge_active_scope ON knowledge(scope_type, scope_id)
WHERE is_active = true;

-- Priority-based queries for guidelines
CREATE INDEX IF NOT EXISTS idx_guidelines_priority ON guidelines(priority DESC)
WHERE is_active = true;

-- Recent entries queries
CREATE INDEX IF NOT EXISTS idx_tools_recent ON tools(created_at DESC)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_guidelines_recent ON guidelines(created_at DESC)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_knowledge_recent ON knowledge(created_at DESC)
WHERE is_active = true;

-- Session lookup by project and status
CREATE INDEX IF NOT EXISTS idx_sessions_project_status ON sessions(project_id, status);

-- Tag lookup optimizations
CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category);
CREATE INDEX IF NOT EXISTS idx_tags_predefined ON tags(is_predefined) WHERE is_predefined = true;
