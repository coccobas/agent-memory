-- Performance indexes for common query patterns
-- These indexes optimize queries that filter by is_active and order by created_at

-- Tools: composite index for scope + active queries with created_at ordering
CREATE INDEX IF NOT EXISTS `idx_tools_active_scope` ON `tools` (`is_active`, `scope_type`, `scope_id`, `created_at`);

-- Guidelines: composite index for scope + active queries with created_at ordering
CREATE INDEX IF NOT EXISTS `idx_guidelines_active_scope` ON `guidelines` (`is_active`, `scope_type`, `scope_id`, `created_at`);

-- Knowledge: composite index for scope + active queries with created_at ordering
CREATE INDEX IF NOT EXISTS `idx_knowledge_active_scope` ON `knowledge` (`is_active`, `scope_type`, `scope_id`, `created_at`);

-- Index for filtering by is_active only (used in list operations without scope filter)
CREATE INDEX IF NOT EXISTS `idx_tools_active` ON `tools` (`is_active`);
CREATE INDEX IF NOT EXISTS `idx_guidelines_active` ON `guidelines` (`is_active`);
CREATE INDEX IF NOT EXISTS `idx_knowledge_active` ON `knowledge` (`is_active`);

-- Index for created_at ordering (useful for recent entries queries)
CREATE INDEX IF NOT EXISTS `idx_tools_created` ON `tools` (`created_at` DESC);
CREATE INDEX IF NOT EXISTS `idx_guidelines_created` ON `guidelines` (`created_at` DESC);
CREATE INDEX IF NOT EXISTS `idx_knowledge_created` ON `knowledge` (`created_at` DESC);

-- Permissions: composite index for checkPermission query pattern
-- Matches the common filter order: agent_id, entry_type, scope_type, scope_id
CREATE INDEX IF NOT EXISTS `idx_permissions_check` ON `permissions` (`agent_id`, `entry_type`, `scope_type`, `scope_id`);
