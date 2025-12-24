-- Migration 0016: Add access tracking for memory forgetting
-- Adds lastAccessedAt and accessCount to main entry tables

-- Tools access tracking
ALTER TABLE tools ADD COLUMN last_accessed_at TEXT;
ALTER TABLE tools ADD COLUMN access_count INTEGER DEFAULT 0;

-- Guidelines access tracking
ALTER TABLE guidelines ADD COLUMN last_accessed_at TEXT;
ALTER TABLE guidelines ADD COLUMN access_count INTEGER DEFAULT 0;

-- Knowledge access tracking
ALTER TABLE knowledge ADD COLUMN last_accessed_at TEXT;
ALTER TABLE knowledge ADD COLUMN access_count INTEGER DEFAULT 0;

-- Create indexes for efficient forgetting queries
CREATE INDEX IF NOT EXISTS idx_tools_access ON tools(last_accessed_at, access_count);
CREATE INDEX IF NOT EXISTS idx_guidelines_access ON guidelines(last_accessed_at, access_count);
CREATE INDEX IF NOT EXISTS idx_knowledge_access ON knowledge(last_accessed_at, access_count);
CREATE INDEX IF NOT EXISTS idx_experiences_access ON experiences(last_used_at, use_count);
