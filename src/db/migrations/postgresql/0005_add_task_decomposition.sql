-- Migration 0005: Add Task Decomposition Support
-- Uses knowledge entries to store task decomposition metadata
-- No additional tables needed - task hierarchies stored via entry_relations with 'parent_task' and 'subtask_of' types
-- This migration is a placeholder for future task-specific indexes if needed

-- Add index for efficient task hierarchy queries
CREATE INDEX IF NOT EXISTS idx_relations_parent_task ON entry_relations(target_id)
WHERE relation_type = 'parent_task';

CREATE INDEX IF NOT EXISTS idx_relations_subtask ON entry_relations(source_id)
WHERE relation_type = 'subtask_of';
