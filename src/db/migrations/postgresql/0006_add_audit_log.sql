-- Migration 0006: Add Audit Log Table
-- Tracks all actions for compliance and debugging

CREATE TABLE audit_log (
    id text PRIMARY KEY,
    agent_id text,
    action text NOT NULL,
    entry_type text,
    entry_id text,
    scope_type text,
    scope_id text,
    query_params jsonb,
    result_count integer,
    execution_time integer,
    success boolean DEFAULT true,
    error_message text,
    subtask_type text,
    parent_task_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_log_entry_type_check CHECK (entry_type IS NULL OR entry_type IN ('tool', 'guideline', 'knowledge')),
    CONSTRAINT audit_log_scope_type_check CHECK (scope_type IS NULL OR scope_type IN ('global', 'org', 'project', 'session'))
);

CREATE INDEX idx_audit_agent ON audit_log(agent_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_entry ON audit_log(entry_type, entry_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);
CREATE INDEX idx_audit_execution ON audit_log(success, subtask_type);
CREATE INDEX idx_audit_parent_task ON audit_log(parent_task_id);

-- Partition by time for efficient cleanup (optional - can be enabled later)
-- COMMENT: For high-volume deployments, consider partitioning this table by created_at
