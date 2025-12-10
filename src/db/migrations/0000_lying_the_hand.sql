CREATE TABLE `conflict_log` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_type` text NOT NULL,
	`entry_id` text NOT NULL,
	`version_a_id` text NOT NULL,
	`version_b_id` text NOT NULL,
	`detected_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`resolved` integer DEFAULT false NOT NULL,
	`resolution` text,
	`resolved_at` text,
	`resolved_by` text
);
--> statement-breakpoint
CREATE INDEX `idx_conflicts_entry` ON `conflict_log` (`entry_type`,`entry_id`);--> statement-breakpoint
CREATE INDEX `idx_conflicts_unresolved` ON `conflict_log` (`entry_type`,`entry_id`) WHERE resolved = 0;--> statement-breakpoint
CREATE TABLE `entry_relations` (
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
CREATE INDEX `idx_relations_source` ON `entry_relations` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `idx_relations_target` ON `entry_relations` (`target_type`,`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_relations_unique` ON `entry_relations` (`source_type`,`source_id`,`target_type`,`target_id`,`relation_type`);--> statement-breakpoint
CREATE TABLE `entry_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_type` text NOT NULL,
	`entry_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_entry_tags_entry` ON `entry_tags` (`entry_type`,`entry_id`);--> statement-breakpoint
CREATE INDEX `idx_entry_tags_tag` ON `entry_tags` (`tag_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_entry_tags_unique` ON `entry_tags` (`entry_type`,`entry_id`,`tag_id`);--> statement-breakpoint
CREATE TABLE `guideline_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`guideline_id` text NOT NULL,
	`version_num` integer NOT NULL,
	`content` text NOT NULL,
	`rationale` text,
	`examples` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`change_reason` text,
	`conflict_flag` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`guideline_id`) REFERENCES `guidelines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_guideline_versions_guideline` ON `guideline_versions` (`guideline_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_guideline_versions_unique` ON `guideline_versions` (`guideline_id`,`version_num`);--> statement-breakpoint
CREATE TABLE `guidelines` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text,
	`name` text NOT NULL,
	`category` text,
	`priority` integer DEFAULT 50 NOT NULL,
	`current_version_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text
);
--> statement-breakpoint
CREATE INDEX `idx_guidelines_scope` ON `guidelines` (`scope_type`,`scope_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_guidelines_scope_name` ON `guidelines` (`scope_type`,`scope_id`,`name`);--> statement-breakpoint
CREATE TABLE `knowledge` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text,
	`title` text NOT NULL,
	`category` text,
	`current_version_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text
);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_scope` ON `knowledge` (`scope_type`,`scope_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_knowledge_scope_title` ON `knowledge` (`scope_type`,`scope_id`,`title`);--> statement-breakpoint
CREATE TABLE `knowledge_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`knowledge_id` text NOT NULL,
	`version_num` integer NOT NULL,
	`content` text NOT NULL,
	`source` text,
	`confidence` real DEFAULT 1 NOT NULL,
	`valid_until` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`change_reason` text,
	`conflict_flag` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`knowledge_id`) REFERENCES `knowledge`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_versions_knowledge` ON `knowledge_versions` (`knowledge_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_knowledge_versions_unique` ON `knowledge_versions` (`knowledge_id`,`version_num`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text,
	`name` text NOT NULL,
	`description` text,
	`root_path` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`metadata` text,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_projects_org` ON `projects` (`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_projects_org_name` ON `projects` (`org_id`,`name`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`name` text,
	`purpose` text,
	`agent_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`ended_at` text,
	`metadata` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_project` ON `sessions` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_status` ON `sessions` (`status`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`is_predefined` integer DEFAULT false NOT NULL,
	`description` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tags_name` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `tool_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`tool_id` text NOT NULL,
	`version_num` integer NOT NULL,
	`description` text,
	`parameters` text,
	`examples` text,
	`constraints` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`change_reason` text,
	`conflict_flag` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`tool_id`) REFERENCES `tools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tool_versions_tool` ON `tool_versions` (`tool_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tool_versions_unique` ON `tool_versions` (`tool_id`,`version_num`);--> statement-breakpoint
CREATE TABLE `tools` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text,
	`name` text NOT NULL,
	`category` text,
	`current_version_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text
);
--> statement-breakpoint
CREATE INDEX `idx_tools_scope` ON `tools` (`scope_type`,`scope_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tools_scope_name` ON `tools` (`scope_type`,`scope_id`,`name`);