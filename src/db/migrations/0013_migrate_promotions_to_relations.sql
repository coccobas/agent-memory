-- Migrate embedded promotion foreign keys to entry_relations table
-- This enables better querying and maintains the polymorphic relations pattern

-- Step 1: Migrate promotedToToolId (experience -> tool) to entry_relations
-- Note: Only creates relation if promoted_to_tool_id is not null
INSERT INTO entry_relations (id, source_type, source_id, target_type, target_id, relation_type, created_at, created_by)
SELECT
    lower(hex(randomblob(16))) as id,
    'experience' as source_type,
    e.id as source_id,
    'tool' as target_type,
    e.promoted_to_tool_id as target_id,
    'promoted_to' as relation_type,
    COALESCE(e.created_at, CURRENT_TIMESTAMP) as created_at,
    e.created_by
FROM experiences e
WHERE e.promoted_to_tool_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM entry_relations er
    WHERE er.source_type = 'experience'
      AND er.source_id = e.id
      AND er.target_type = 'tool'
      AND er.target_id = e.promoted_to_tool_id
      AND er.relation_type = 'promoted_to'
  );
--> statement-breakpoint

-- Step 2: Migrate promotedFromId (source experience -> promoted experience) to entry_relations
-- The relation is: source_experience --promoted_to--> this_experience
-- So we create: promotedFromId (source) -> this experience (target)
INSERT INTO entry_relations (id, source_type, source_id, target_type, target_id, relation_type, created_at, created_by)
SELECT
    lower(hex(randomblob(16))) as id,
    'experience' as source_type,
    e.promoted_from_id as source_id,
    'experience' as target_type,
    e.id as target_id,
    'promoted_to' as relation_type,
    COALESCE(e.created_at, CURRENT_TIMESTAMP) as created_at,
    e.created_by
FROM experiences e
WHERE e.promoted_from_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM entry_relations er
    WHERE er.source_type = 'experience'
      AND er.source_id = e.promoted_from_id
      AND er.target_type = 'experience'
      AND er.target_id = e.id
      AND er.relation_type = 'promoted_to'
  );

-- Note: We keep the original columns (promoted_to_tool_id, promoted_from_id) for now
-- to allow rollback. They can be removed in a future migration once the relation-based
-- approach is fully verified.
