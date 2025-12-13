-- Conversation history tables for tracking agent-user and agent-agent interactions
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text REFERENCES sessions(id),
	`project_id` text REFERENCES projects(id),
	`agent_id` text,
	`title` text,
	`status` text DEFAULT 'active' NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`ended_at` text,
	`metadata` text
);
--> statement-breakpoint
CREATE INDEX `idx_conversations_session` ON `conversations` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_conversations_project` ON `conversations` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_conversations_agent` ON `conversations` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_conversations_status` ON `conversations` (`status`);--> statement-breakpoint
CREATE INDEX `idx_conversations_started` ON `conversations` (`started_at`);--> statement-breakpoint
CREATE TABLE `conversation_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text REFERENCES conversations(id) NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`message_index` integer NOT NULL,
	`context_entries` text,
	`tools_used` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE INDEX `idx_messages_conversation` ON `conversation_messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_index` ON `conversation_messages` (`conversation_id`, `message_index`);--> statement-breakpoint
CREATE INDEX `idx_messages_role` ON `conversation_messages` (`conversation_id`, `role`);--> statement-breakpoint
CREATE TABLE `conversation_context` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text REFERENCES conversations(id) NOT NULL,
	`message_id` text REFERENCES conversation_messages(id),
	`entry_type` text NOT NULL,
	`entry_id` text NOT NULL,
	`relevance_score` real,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_context_conversation` ON `conversation_context` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `idx_context_message` ON `conversation_context` (`message_id`);--> statement-breakpoint
CREATE INDEX `idx_context_entry` ON `conversation_context` (`entry_type`, `entry_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_context_unique` ON `conversation_context` (`conversation_id`, `message_id`, `entry_type`, `entry_id`);















