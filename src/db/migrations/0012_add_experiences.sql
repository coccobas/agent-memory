-- Experiential memory tables for learning from past interactions
-- Supports case-level (concrete examples) and strategy-level (abstracted patterns)

CREATE TABLE `experiences` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text,
	`title` text NOT NULL,
	`level` text DEFAULT 'case' NOT NULL,
	`category` text,
	`current_version_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`promoted_to_tool_id` text REFERENCES tools(id) ON DELETE SET NULL,
	`promoted_from_id` text,
	`use_count` integer DEFAULT 0 NOT NULL,
	`success_count` integer DEFAULT 0 NOT NULL,
	`last_used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text
);
--> statement-breakpoint
CREATE INDEX `idx_experiences_scope` ON `experiences` (`scope_type`, `scope_id`);--> statement-breakpoint
CREATE INDEX `idx_experiences_level` ON `experiences` (`level`);--> statement-breakpoint
CREATE INDEX `idx_experiences_category` ON `experiences` (`category`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_experiences_scope_title` ON `experiences` (`scope_type`, `scope_id`, `title`);--> statement-breakpoint

CREATE TABLE `experience_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`experience_id` text NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
	`version_num` integer NOT NULL,
	`content` text NOT NULL,
	`scenario` text,
	`outcome` text,
	`pattern` text,
	`applicability` text,
	`contraindications` text,
	`confidence` real DEFAULT 0.5,
	`source` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`change_reason` text,
	`conflict_flag` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_experience_versions_experience` ON `experience_versions` (`experience_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_experience_versions_unique` ON `experience_versions` (`experience_id`, `version_num`);--> statement-breakpoint

CREATE TABLE `experience_trajectory_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`experience_version_id` text NOT NULL REFERENCES experience_versions(id) ON DELETE CASCADE,
	`step_num` integer NOT NULL,
	`action` text NOT NULL,
	`observation` text,
	`reasoning` text,
	`tool_used` text,
	`success` integer,
	`timestamp` text,
	`duration_ms` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_trajectory_steps_version` ON `experience_trajectory_steps` (`experience_version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_trajectory_steps_order` ON `experience_trajectory_steps` (`experience_version_id`, `step_num`);
