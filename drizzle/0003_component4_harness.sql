CREATE TABLE `agent_trace_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`update_id` integer NOT NULL,
	`correlation_id` text NOT NULL,
	`seq` integer NOT NULL,
	`parent_event_id` text,
	`layer` text NOT NULL,
	`component` text NOT NULL,
	`stage` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shop_profile_history` (
	`id` text PRIMARY KEY NOT NULL,
	`update_id` integer NOT NULL,
	`correlation_id` text NOT NULL,
	`field` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`applied_at` text NOT NULL
);
