-- Agent votes table for multi-agent voting/consensus
CREATE TABLE `agent_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`vote_value` text NOT NULL,
	`confidence` real DEFAULT 1.0 NOT NULL,
	`reasoning` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_votes_task` ON `agent_votes` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_votes_agent` ON `agent_votes` (`agent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_votes_unique` ON `agent_votes` (`task_id`, `agent_id`);

