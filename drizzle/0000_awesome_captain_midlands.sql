CREATE TABLE `conversation_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`is_active` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversation_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`update_id` integer NOT NULL,
	`role` text NOT NULL,
	`raw_text` text NOT NULL,
	`context_text` text NOT NULL,
	`inbound_kind` text NOT NULL,
	`command` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `conversation_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `execution_ledger` (
	`update_id` integer PRIMARY KEY NOT NULL,
	`correlation_id` text NOT NULL,
	`terminal_status` text NOT NULL,
	`delivered` integer NOT NULL,
	`failure_reason` text,
	`completed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `store_meta` (
	`id` integer PRIMARY KEY NOT NULL,
	`initialized_at` text,
	`created_at` text NOT NULL
);
