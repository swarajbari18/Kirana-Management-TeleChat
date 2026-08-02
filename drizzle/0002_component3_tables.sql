CREATE TABLE `shop_profile` (
	`id` integer PRIMARY KEY NOT NULL,
	`shop_name` text,
	`owner_name` text,
	`gst_registered` integer,
	`gstin` text,
	`instructions_json` text DEFAULT '[]' NOT NULL,
	`confirmation_timeout_ms` integer DEFAULT 300000 NOT NULL,
	`complete_autonomy` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `work_queue` (
	`update_id` integer PRIMARY KEY NOT NULL,
	`request_json` text NOT NULL,
	`status` text NOT NULL,
	`correlation_id` text,
	`enqueued_at` text NOT NULL,
	`started_at` text,
	`completed_at` text,
	`failure_reason` text
);
--> statement-breakpoint
CREATE TABLE `pending_confirmations` (
	`id` text PRIMARY KEY NOT NULL,
	`update_id` integer NOT NULL,
	`correlation_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`display_payload_json` text NOT NULL,
	`pending_write_json` text NOT NULL,
	`status` text NOT NULL,
	`callback_query_id` text,
	`created_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE TABLE `orchestration_checkpoints` (
	`update_id` integer PRIMARY KEY NOT NULL,
	`correlation_id` text NOT NULL,
	`stage` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`updated_at` text NOT NULL
);
