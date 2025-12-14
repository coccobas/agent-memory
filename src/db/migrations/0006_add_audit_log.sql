-- Audit log table for tracking all actions
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text,
	`action` text NOT NULL,
	`entry_type` text,
	`entry_id` text,
	`scope_type` text,
	`scope_id` text,
	`query_params` text,
	`result_count` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_agent` ON `audit_log` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_action` ON `audit_log` (`action`);--> statement-breakpoint
CREATE INDEX `idx_audit_entry` ON `audit_log` (`entry_type`, `entry_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_created` ON `audit_log` (`created_at`);


















