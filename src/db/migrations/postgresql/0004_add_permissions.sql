-- Migration 0004: Add Permissions Table
-- Fine-grained access control for agents/users

CREATE TABLE permissions (
    id text PRIMARY KEY,
    agent_id text NOT NULL,
    scope_type text,
    scope_id text,
    entry_type text,
    entry_id text,
    permission text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT permissions_scope_type_check CHECK (scope_type IS NULL OR scope_type IN ('global', 'org', 'project', 'session')),
    CONSTRAINT permissions_entry_type_check CHECK (entry_type IS NULL OR entry_type IN ('tool', 'guideline', 'knowledge')),
    CONSTRAINT permissions_permission_check CHECK (permission IN ('read', 'write', 'admin'))
);

CREATE INDEX idx_permissions_agent ON permissions(agent_id);
CREATE INDEX idx_permissions_scope ON permissions(scope_type, scope_id);
CREATE INDEX idx_permissions_entry ON permissions(entry_type, entry_id);
CREATE UNIQUE INDEX idx_permissions_unique ON permissions(agent_id, scope_type, scope_id, entry_type, entry_id, permission);
