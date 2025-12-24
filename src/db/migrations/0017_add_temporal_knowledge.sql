-- Migration 0017: Add temporal validity fields to knowledge
-- Enables temporal knowledge graphs with valid_from/valid_until semantics

-- Add validFrom to complement existing validUntil
ALTER TABLE knowledge_versions ADD COLUMN valid_from TEXT;

-- Add invalidatedBy to track superseding entries
ALTER TABLE knowledge_versions ADD COLUMN invalidated_by TEXT;

-- Create index for temporal queries
CREATE INDEX IF NOT EXISTS idx_knowledge_temporal ON knowledge_versions(valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_knowledge_invalidated ON knowledge_versions(invalidated_by) WHERE invalidated_by IS NOT NULL;
