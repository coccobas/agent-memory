-- Migration 0000: Initial PostgreSQL Schema
-- Creates all base tables for Agent Memory

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- SCOPE TABLES
-- =============================================================================

CREATE TABLE organizations (
    id text PRIMARY KEY,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb
);

CREATE TABLE projects (
    id text PRIMARY KEY,
    org_id text REFERENCES organizations(id) ON DELETE SET NULL,
    name text NOT NULL,
    description text,
    root_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb
);

CREATE INDEX idx_projects_org ON projects(org_id);
CREATE UNIQUE INDEX idx_projects_org_name ON projects(org_id, name);

CREATE TABLE sessions (
    id text PRIMARY KEY,
    project_id text REFERENCES projects(id) ON DELETE CASCADE,
    name text,
    purpose text,
    agent_id text,
    status text DEFAULT 'active' NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    metadata jsonb,
    CONSTRAINT sessions_status_check CHECK (status IN ('active', 'paused', 'completed', 'discarded'))
);

CREATE INDEX idx_sessions_project ON sessions(project_id);
CREATE INDEX idx_sessions_status ON sessions(status);

-- =============================================================================
-- TAGS
-- =============================================================================

CREATE TABLE tags (
    id text PRIMARY KEY,
    name text NOT NULL,
    category text,
    is_predefined boolean DEFAULT false NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tags_category_check CHECK (category IS NULL OR category IN ('language', 'domain', 'category', 'meta', 'custom'))
);

CREATE UNIQUE INDEX idx_tags_name ON tags(name);

-- =============================================================================
-- MEMORY ENTRY TABLES
-- =============================================================================

CREATE TABLE tools (
    id text PRIMARY KEY,
    scope_type text NOT NULL,
    scope_id text,
    name text NOT NULL,
    category text,
    current_version_id text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    CONSTRAINT tools_scope_type_check CHECK (scope_type IN ('global', 'org', 'project', 'session')),
    CONSTRAINT tools_category_check CHECK (category IS NULL OR category IN ('mcp', 'cli', 'function', 'api'))
);

CREATE INDEX idx_tools_scope ON tools(scope_type, scope_id);
CREATE UNIQUE INDEX idx_tools_scope_name ON tools(scope_type, scope_id, name);

CREATE TABLE tool_versions (
    id text PRIMARY KEY,
    tool_id text NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    version_num integer NOT NULL,
    description text,
    parameters jsonb,
    examples jsonb,
    constraints text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    change_reason text,
    conflict_flag boolean DEFAULT false NOT NULL
);

CREATE INDEX idx_tool_versions_tool ON tool_versions(tool_id);
CREATE UNIQUE INDEX idx_tool_versions_unique ON tool_versions(tool_id, version_num);

CREATE TABLE guidelines (
    id text PRIMARY KEY,
    scope_type text NOT NULL,
    scope_id text,
    name text NOT NULL,
    category text,
    priority integer DEFAULT 50 NOT NULL,
    current_version_id text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    CONSTRAINT guidelines_scope_type_check CHECK (scope_type IN ('global', 'org', 'project', 'session'))
);

CREATE INDEX idx_guidelines_scope ON guidelines(scope_type, scope_id);
CREATE UNIQUE INDEX idx_guidelines_scope_name ON guidelines(scope_type, scope_id, name);

CREATE TABLE guideline_versions (
    id text PRIMARY KEY,
    guideline_id text NOT NULL REFERENCES guidelines(id) ON DELETE CASCADE,
    version_num integer NOT NULL,
    content text NOT NULL,
    rationale text,
    examples jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    change_reason text,
    conflict_flag boolean DEFAULT false NOT NULL,
    verification_rules jsonb
);

CREATE INDEX idx_guideline_versions_guideline ON guideline_versions(guideline_id);
CREATE UNIQUE INDEX idx_guideline_versions_unique ON guideline_versions(guideline_id, version_num);

CREATE TABLE knowledge (
    id text PRIMARY KEY,
    scope_type text NOT NULL,
    scope_id text,
    title text NOT NULL,
    category text,
    current_version_id text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    CONSTRAINT knowledge_scope_type_check CHECK (scope_type IN ('global', 'org', 'project', 'session')),
    CONSTRAINT knowledge_category_check CHECK (category IS NULL OR category IN ('decision', 'fact', 'context', 'reference'))
);

CREATE INDEX idx_knowledge_scope ON knowledge(scope_type, scope_id);
CREATE UNIQUE INDEX idx_knowledge_scope_title ON knowledge(scope_type, scope_id, title);

CREATE TABLE knowledge_versions (
    id text PRIMARY KEY,
    knowledge_id text NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
    version_num integer NOT NULL,
    content text NOT NULL,
    source text,
    confidence real DEFAULT 1.0 NOT NULL,
    valid_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    change_reason text,
    conflict_flag boolean DEFAULT false NOT NULL
);

CREATE INDEX idx_knowledge_versions_knowledge ON knowledge_versions(knowledge_id);
CREATE UNIQUE INDEX idx_knowledge_versions_unique ON knowledge_versions(knowledge_id, version_num);

-- =============================================================================
-- META TABLES
-- =============================================================================

CREATE TABLE entry_tags (
    id text PRIMARY KEY,
    entry_type text NOT NULL,
    entry_id text NOT NULL,
    tag_id text NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entry_tags_entry_type_check CHECK (entry_type IN ('tool', 'guideline', 'knowledge', 'project'))
);

CREATE INDEX idx_entry_tags_entry ON entry_tags(entry_type, entry_id);
CREATE INDEX idx_entry_tags_tag ON entry_tags(tag_id);
CREATE UNIQUE INDEX idx_entry_tags_unique ON entry_tags(entry_type, entry_id, tag_id);

CREATE TABLE entry_relations (
    id text PRIMARY KEY,
    source_type text NOT NULL,
    source_id text NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    relation_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    CONSTRAINT entry_relations_source_type_check CHECK (source_type IN ('tool', 'guideline', 'knowledge', 'project')),
    CONSTRAINT entry_relations_target_type_check CHECK (target_type IN ('tool', 'guideline', 'knowledge', 'project')),
    CONSTRAINT entry_relations_relation_type_check CHECK (relation_type IN ('applies_to', 'depends_on', 'conflicts_with', 'related_to', 'parent_task', 'subtask_of'))
);

CREATE INDEX idx_relations_source ON entry_relations(source_type, source_id);
CREATE INDEX idx_relations_target ON entry_relations(target_type, target_id);
CREATE UNIQUE INDEX idx_relations_unique ON entry_relations(source_type, source_id, target_type, target_id, relation_type);

CREATE TABLE conflict_log (
    id text PRIMARY KEY,
    entry_type text NOT NULL,
    entry_id text NOT NULL,
    version_a_id text NOT NULL,
    version_b_id text NOT NULL,
    detected_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved boolean DEFAULT false NOT NULL,
    resolution text,
    resolved_at timestamp with time zone,
    resolved_by text,
    CONSTRAINT conflict_log_entry_type_check CHECK (entry_type IN ('tool', 'guideline', 'knowledge'))
);

CREATE INDEX idx_conflicts_entry ON conflict_log(entry_type, entry_id);
CREATE INDEX idx_conflicts_unresolved ON conflict_log(entry_type, entry_id) WHERE resolved = false;
