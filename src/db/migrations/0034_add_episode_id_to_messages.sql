-- Add episode_id to conversation_messages for message-level episode linking
ALTER TABLE `conversation_messages` ADD COLUMN `episode_id` text REFERENCES episodes(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX `idx_messages_episode` ON `conversation_messages` (`episode_id`);
