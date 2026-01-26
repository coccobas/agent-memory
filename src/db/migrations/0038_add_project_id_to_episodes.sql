-- Add project_id column to episodes table for direct project-level queries
-- This enables listing episodes across all sessions within a project

-- Add the column (nullable to support existing data)
ALTER TABLE episodes ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;

-- Create index for project-level queries
CREATE INDEX IF NOT EXISTS idx_episodes_project ON episodes(project_id);

-- Backfill project_id from session's projectId for existing episodes
UPDATE episodes
SET project_id = (
  SELECT s.project_id
  FROM sessions s
  WHERE s.id = episodes.session_id
)
WHERE session_id IS NOT NULL AND project_id IS NULL;
