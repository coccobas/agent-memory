-- Episodes: First-class temporal constructs for activity grouping and causal chains
-- Enables "what happened during X?" and "what led to this?" queries

CREATE TABLE `episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text,
	`session_id` text REFERENCES sessions(id) ON DELETE CASCADE,

	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'planned' NOT NULL CHECK (status IN ('planned', 'active', 'completed', 'failed', 'cancelled')),
	`outcome` text,
	`outcome_type` text CHECK (outcome_type IN ('success', 'partial', 'failure', 'abandoned')),

	`planned_at` text,
	`started_at` text,
	`ended_at` text,
	`duration_ms` integer,

	`parent_episode_id` text REFERENCES episodes(id),
	`depth` integer DEFAULT 0,

	`trigger_type` text,
	`trigger_ref` text,

	`tags` text,
	`metadata` text,

	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_episodes_session` ON `episodes` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_episodes_status` ON `episodes` (`status`);--> statement-breakpoint
CREATE INDEX `idx_episodes_time_range` ON `episodes` (`started_at`, `ended_at`);--> statement-breakpoint
CREATE INDEX `idx_episodes_scope` ON `episodes` (`scope_type`, `scope_id`);--> statement-breakpoint
CREATE INDEX `idx_episodes_parent` ON `episodes` (`parent_episode_id`);--> statement-breakpoint

CREATE TABLE `episode_events` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,

	`event_type` text NOT NULL,
	`name` text NOT NULL,
	`description` text,

	`occurred_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`sequence_num` integer NOT NULL,

	`entry_type` text,
	`entry_id` text,
	`data` text,

	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_episode_events_episode` ON `episode_events` (`episode_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_episode_events_sequence` ON `episode_events` (`episode_id`, `sequence_num`);--> statement-breakpoint
