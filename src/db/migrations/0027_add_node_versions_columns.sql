-- Migration: Add missing columns to node_versions table
-- Fixes schema mismatch: "table node_versions has no column named invalidated_by"

-- Add invalidated_by column - tracks which version superseded this one
ALTER TABLE node_versions ADD COLUMN invalidated_by TEXT;

-- Add conflict_flag column - used for conflict detection
ALTER TABLE node_versions ADD COLUMN conflict_flag INTEGER DEFAULT 0;
