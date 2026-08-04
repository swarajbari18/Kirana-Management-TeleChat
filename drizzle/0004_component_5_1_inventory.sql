CREATE TABLE `inventory_products` (
	`sku` text PRIMARY KEY NOT NULL,
	`product_name` text NOT NULL,
	`item_type` text NOT NULL,
	`unit` text NOT NULL,
	`quantity_on_hand` integer NOT NULL,
	`cost_price` integer NOT NULL,
	`sell_price` integer NOT NULL,
	`hsn_code` text NOT NULL,
	`gst_rate` integer NOT NULL,
	`reorder_level` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory_product_aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sku` text NOT NULL,
	`alias` text NOT NULL,
	FOREIGN KEY (`sku`) REFERENCES `inventory_products`(`sku`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_product_aliases_sku_alias_unique` ON `inventory_product_aliases` (`sku`,`alias`);
--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`sku` text NOT NULL,
	`movement_type` text NOT NULL,
	`quantity_delta` integer NOT NULL,
	`balance_before` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`reference_type` text,
	`reference_id` text,
	`update_id` integer NOT NULL,
	`correlation_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`sku`) REFERENCES `inventory_products`(`sku`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `inventory_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`sku` text NOT NULL,
	`quantity` integer NOT NULL,
	`draft_bill_id` text NOT NULL,
	`status` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`sku`) REFERENCES `inventory_products`(`sku`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_reservations_idempotency_key_unique` ON `inventory_reservations` (`idempotency_key`);
