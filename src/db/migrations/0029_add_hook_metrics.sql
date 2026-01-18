-- Hook Metrics: Analytics data from Claude Code hooks
-- Tracks tool executions, subagent completions, and notifications

CREATE TABLE `hook_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`metric_type` text NOT NULL CHECK (metric_type IN ('tool_execution', 'subagent', 'notification')),
	`session_id` text,
	`project_id` text,
	`data` text NOT NULL,
	`timestamp` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_hook_metrics_session` ON `hook_metrics` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_hook_metrics_type` ON `hook_metrics` (`metric_type`);--> statement-breakpoint
CREATE INDEX `idx_hook_metrics_timestamp` ON `hook_metrics` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_hook_metrics_project` ON `hook_metrics` (`project_id`);--> statement-breakpoint
