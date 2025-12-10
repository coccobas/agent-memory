CREATE TABLE `file_locks` (
	`id` text PRIMARY KEY NOT NULL,
	`file_path` text NOT NULL,
	`checked_out_by` text NOT NULL,
	`session_id` text,
	`project_id` text,
	`checked_out_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text,
	`metadata` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_file_locks_path` ON `file_locks` (`file_path`);--> statement-breakpoint
CREATE INDEX `idx_file_locks_agent` ON `file_locks` (`checked_out_by`);--> statement-breakpoint
CREATE INDEX `idx_file_locks_expires` ON `file_locks` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_file_locks_project` ON `file_locks` (`project_id`);






