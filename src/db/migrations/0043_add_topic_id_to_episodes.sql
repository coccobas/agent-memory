-- Add topicId foreign key to episodes table
ALTER TABLE `episodes` ADD COLUMN `topic_id` text;
--> statement-breakpoint
-- Add foreign key constraint for topicId
CREATE TABLE `__new_episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text,
	`project_id` text,
	`session_id` text,
	`topic_id` text,
	`conversation_id` text,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`outcome` text,
	`outcome_type` text,
	`planned_at` text,
	`started_at` text,
	`ended_at` text,
	`duration_ms` integer,
	`parent_episode_id` text,
	`depth` integer DEFAULT 0,
	`trigger_type` text,
	`trigger_ref` text,
	`tags` text,
	`metadata` text,
	`quality_score` integer,
	`quality_factors` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_episodes` SELECT * FROM `episodes`;
--> statement-breakpoint
DROP TABLE `episodes`;
--> statement-breakpoint
ALTER TABLE `__new_episodes` RENAME TO `episodes`;
--> statement-breakpoint
CREATE INDEX `idx_episodes_project` ON `episodes` (`project_id`);
--> statement-breakpoint
CREATE INDEX `idx_episodes_session` ON `episodes` (`session_id`);
--> statement-breakpoint
CREATE INDEX `idx_episodes_topic` ON `episodes` (`topic_id`);
--> statement-breakpoint
CREATE INDEX `idx_episodes_conversation` ON `episodes` (`conversation_id`);
--> statement-breakpoint
CREATE INDEX `idx_episodes_status` ON `episodes` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_episodes_time_range` ON `episodes` (`started_at`,`ended_at`);
--> statement-breakpoint
CREATE INDEX `idx_episodes_scope` ON `episodes` (`scope_type`,`scope_id`);
--> statement-breakpoint
CREATE INDEX `idx_episodes_parent` ON `episodes` (`parent_episode_id`);
