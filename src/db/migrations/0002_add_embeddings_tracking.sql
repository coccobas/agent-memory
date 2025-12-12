CREATE TABLE `entry_embeddings` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_type` text NOT NULL,
	`entry_id` text NOT NULL,
	`version_id` text NOT NULL,
	`has_embedding` integer DEFAULT 0 NOT NULL,
	`embedding_model` text,
	`embedding_provider` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_entry_embeddings_entry` ON `entry_embeddings` (`entry_type`, `entry_id`);--> statement-breakpoint
CREATE INDEX `idx_entry_embeddings_status` ON `entry_embeddings` (`has_embedding`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_entry_embeddings_version` ON `entry_embeddings` (`entry_type`, `entry_id`, `version_id`);














