-- Migration: Add composite indexes for common query pattern (scopeType, scopeId, isActive)
-- Issue #5 from code review: Missing composite database indexes
-- These indexes optimize the most common query pattern: filtering active entries within a scope

-- Tools table
CREATE INDEX IF NOT EXISTS idx_tools_scope_active ON tools(scope_type, scope_id, is_active);

-- Guidelines table
CREATE INDEX IF NOT EXISTS idx_guidelines_scope_active ON guidelines(scope_type, scope_id, is_active);

-- Knowledge table
CREATE INDEX IF NOT EXISTS idx_knowledge_scope_active ON knowledge(scope_type, scope_id, is_active);

-- Experiences table (also needs isActive index)
CREATE INDEX IF NOT EXISTS idx_experiences_active ON experiences(is_active);
CREATE INDEX IF NOT EXISTS idx_experiences_scope_active ON experiences(scope_type, scope_id, is_active);

-- Tasks table (also needs isActive index)
CREATE INDEX IF NOT EXISTS idx_tasks_active ON tasks(is_active);
CREATE INDEX IF NOT EXISTS idx_tasks_scope_active ON tasks(scope_type, scope_id, is_active);
