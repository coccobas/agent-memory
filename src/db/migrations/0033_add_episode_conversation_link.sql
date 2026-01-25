-- Link episodes to conversations for full conversation capture
ALTER TABLE `episodes` ADD COLUMN `conversation_id` text REFERENCES conversations(id);
--> statement-breakpoint
CREATE INDEX `idx_episodes_conversation` ON `episodes` (`conversation_id`);
