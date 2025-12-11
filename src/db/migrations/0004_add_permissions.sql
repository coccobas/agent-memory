-- Permissions table for fine-grained access control
CREATE TABLE `permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`scope_type` text,
	`scope_id` text,
	`entry_type` text,
	`entry_id` text,
	`permission` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_permissions_agent` ON `permissions` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_permissions_scope` ON `permissions` (`scope_type`, `scope_id`);--> statement-breakpoint
CREATE INDEX `idx_permissions_entry` ON `permissions` (`entry_type`, `entry_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_permissions_unique` ON `permissions` (`agent_id`, `scope_type`, `scope_id`, `entry_type`, `entry_id`, `permission`);



