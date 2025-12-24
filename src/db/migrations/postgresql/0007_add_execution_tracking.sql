-- Migration 0007: Add Execution Tracking
-- Additional indexes for execution time analysis

-- Index for finding slow queries
CREATE INDEX IF NOT EXISTS idx_audit_slow_queries ON audit_log(execution_time DESC)
WHERE success = true AND execution_time IS NOT NULL;

-- Index for error analysis by agent
CREATE INDEX IF NOT EXISTS idx_audit_errors_by_agent ON audit_log(agent_id, created_at DESC)
WHERE success = false;

-- Index for subtask analysis
CREATE INDEX IF NOT EXISTS idx_audit_subtask_analysis ON audit_log(subtask_type, success, created_at);
