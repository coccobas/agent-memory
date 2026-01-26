-- IDE Transcripts: Immutable storage for IDE conversation history
-- Import once on session start, append on session end, then seal

CREATE TABLE `ide_transcripts` (
  `id` text PRIMARY KEY NOT NULL,
  `ide_name` text NOT NULL,
  `ide_session_id` text NOT NULL,
  `agent_memory_session_id` text,
  `project_id` text,
  `project_path` text,
  `title` text,
  `imported_at` text NOT NULL,
  `last_message_timestamp` text,
  `message_count` integer DEFAULT 0,
  `is_sealed` integer DEFAULT 0,
  `metadata` text,
  FOREIGN KEY (`agent_memory_session_id`) REFERENCES `sessions`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ide_transcripts_unique` ON `ide_transcripts` (`ide_name`, `ide_session_id`);
--> statement-breakpoint
CREATE INDEX `idx_ide_transcripts_session` ON `ide_transcripts` (`agent_memory_session_id`);
--> statement-breakpoint
CREATE INDEX `idx_ide_transcripts_project` ON `ide_transcripts` (`project_id`);

--> statement-breakpoint
CREATE TABLE `ide_transcript_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `transcript_id` text NOT NULL,
  `ide_message_id` text NOT NULL,
  `role` text NOT NULL,
  `content` text NOT NULL,
  `tools_used` text,
  `timestamp` text NOT NULL,
  `metadata` text,
  FOREIGN KEY (`transcript_id`) REFERENCES `ide_transcripts`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_transcript_messages_unique` ON `ide_transcript_messages` (`transcript_id`, `ide_message_id`);
--> statement-breakpoint
CREATE INDEX `idx_transcript_messages_timestamp` ON `ide_transcript_messages` (`transcript_id`, `timestamp`);
