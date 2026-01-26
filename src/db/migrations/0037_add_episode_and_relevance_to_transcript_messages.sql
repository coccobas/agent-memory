-- Add episode linking and relevance scoring to ide_transcript_messages
-- Enables episode-message linking and LLM relevance scoring for transcript messages

ALTER TABLE `ide_transcript_messages` ADD COLUMN `episode_id` text REFERENCES episodes(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `ide_transcript_messages` ADD COLUMN `relevance_score` real;
--> statement-breakpoint
ALTER TABLE `ide_transcript_messages` ADD COLUMN `relevance_category` text;
--> statement-breakpoint
ALTER TABLE `ide_transcript_messages` ADD COLUMN `relevance_scored_at` text;
--> statement-breakpoint
CREATE INDEX `idx_transcript_messages_episode` ON `ide_transcript_messages` (`episode_id`);
--> statement-breakpoint
CREATE INDEX `idx_transcript_messages_relevance` ON `ide_transcript_messages` (`relevance_category`);
