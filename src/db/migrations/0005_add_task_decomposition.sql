-- Add task decomposition relation types
-- Note: This migration updates the enum constraint for entry_relations.relation_type
-- SQLite doesn't support ALTER TYPE, so we need to recreate the table

-- Create new table with extended enum
CREATE TABLE `entry_relations_new` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`relation_type` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text
);
--> statement-breakpoint
-- Copy existing data
INSERT INTO `entry_relations_new` SELECT * FROM `entry_relations`;
--> statement-breakpoint
-- Drop old table
DROP TABLE `entry_relations`;
--> statement-breakpoint
-- Rename new table
ALTER TABLE `entry_relations_new` RENAME TO `entry_relations`;
--> statement-breakpoint
-- Recreate indexes
CREATE INDEX `idx_relations_source` ON `entry_relations` (`source_type`, `source_id`);--> statement-breakpoint
CREATE INDEX `idx_relations_target` ON `entry_relations` (`target_type`, `target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_relations_unique` ON `entry_relations` (`source_type`, `source_id`, `target_type`, `target_id`, `relation_type`);



