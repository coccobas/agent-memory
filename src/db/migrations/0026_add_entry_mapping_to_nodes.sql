-- Migration: Add entry mapping to nodes table
-- This allows bidirectional mapping between entry IDs (knowledge, guidelines, tools, etc.)
-- and graph node IDs for query system migration

-- Add entry_id and entry_type columns to nodes table
ALTER TABLE nodes ADD COLUMN entry_id TEXT;
ALTER TABLE nodes ADD COLUMN entry_type TEXT CHECK (entry_type IN ('knowledge', 'guideline', 'tool', 'experience', 'task') OR entry_type IS NULL);

-- Create index for fast entry → node lookups
CREATE INDEX IF NOT EXISTS idx_nodes_entry ON nodes(entry_type, entry_id);

-- Create unique constraint to prevent duplicate entries
CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_entry_unique ON nodes(entry_type, entry_id) WHERE entry_id IS NOT NULL;
