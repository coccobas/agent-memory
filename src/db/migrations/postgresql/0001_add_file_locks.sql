-- Migration 0001: Add File Locks Table
-- Tracks filesystem files checked out by agents for multi-agent coordination

CREATE TABLE file_locks (
    id text PRIMARY KEY,
    file_path text NOT NULL,
    checked_out_by text NOT NULL,
    session_id text REFERENCES sessions(id) ON DELETE SET NULL,
    project_id text REFERENCES projects(id) ON DELETE SET NULL,
    checked_out_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    metadata jsonb
);

CREATE UNIQUE INDEX idx_file_locks_path ON file_locks(file_path);
CREATE INDEX idx_file_locks_agent ON file_locks(checked_out_by);
CREATE INDEX idx_file_locks_expires ON file_locks(expires_at);
CREATE INDEX idx_file_locks_project ON file_locks(project_id);
