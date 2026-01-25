-- Add relevance scoring columns to conversation_messages
-- Used by the message relevance scoring maintenance task

ALTER TABLE `conversation_messages` ADD COLUMN `relevance_score` real;
--> statement-breakpoint
ALTER TABLE `conversation_messages` ADD COLUMN `relevance_category` text;
--> statement-breakpoint
ALTER TABLE `conversation_messages` ADD COLUMN `relevance_scored_at` text;
--> statement-breakpoint
CREATE INDEX `idx_messages_relevance` ON `conversation_messages` (`relevance_category`);
