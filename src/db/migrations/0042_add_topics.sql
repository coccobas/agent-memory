-- Create topics table for work context containers
CREATE TABLE `topics` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`embedding` text,
	`metadata` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_topics_project` ON `topics` (`project_id`);
--> statement-breakpoint
CREATE INDEX `idx_topics_name` ON `topics` (`name`);
--> statement-breakpoint
CREATE INDEX `idx_topics_status` ON `topics` (`status`);
