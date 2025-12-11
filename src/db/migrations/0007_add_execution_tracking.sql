-- Migration 0007: Add execution tracking fields to audit_log
-- Adds fields for tracking subtask execution metrics

-- Add execution tracking columns to audit_log
ALTER TABLE audit_log ADD COLUMN execution_time INTEGER; -- milliseconds
ALTER TABLE audit_log ADD COLUMN success INTEGER DEFAULT 1; -- boolean (1 = success, 0 = failure)
ALTER TABLE audit_log ADD COLUMN error_message TEXT;
ALTER TABLE audit_log ADD COLUMN subtask_type TEXT;
ALTER TABLE audit_log ADD COLUMN parent_task_id TEXT; -- References parent task for subtask tracking

-- Create index for execution analytics queries
CREATE INDEX IF NOT EXISTS idx_audit_execution ON audit_log(success, subtask_type);
CREATE INDEX IF NOT EXISTS idx_audit_parent_task ON audit_log(parent_task_id);

