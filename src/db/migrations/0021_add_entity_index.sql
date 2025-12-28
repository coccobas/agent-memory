-- Entity Index Table
-- Used for entity-aware retrieval - maps extracted entities to memory entries

CREATE TABLE `entity_index` (
	`entity_value` text NOT NULL,
	`entity_type` text NOT NULL,
	`entry_type` text NOT NULL,
	`entry_id` text NOT NULL,
	PRIMARY KEY(`entity_value`, `entry_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_entity_lookup` ON `entity_index` (`entity_value`);
--> statement-breakpoint
CREATE INDEX `idx_entity_entry_lookup` ON `entity_index` (`entry_id`);
--> statement-breakpoint
CREATE INDEX `idx_entity_type_value` ON `entity_index` (`entity_type`,`entity_value`);
