ALTER TABLE `shop_profile` ADD `artifacts_enabled` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `shop_profile` ADD `default_payment_method` text;
--> statement-breakpoint
CREATE TABLE `billing_drafts` (
	`bill_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`customer_name` text,
	`last_event_at` text NOT NULL,
	`created_at` text NOT NULL,
	`finalized_at` text
);
--> statement-breakpoint
CREATE TABLE `billing_draft_events` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload_json` text NOT NULL,
	`update_id` integer NOT NULL,
	`correlation_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`bill_id`) REFERENCES `billing_drafts`(`bill_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `billing_bills` (
	`bill_id` text PRIMARY KEY NOT NULL,
	`customer_name` text NOT NULL,
	`notes` text,
	`payment_method` text NOT NULL,
	`payment_reference` text,
	`subtotal_paise` integer NOT NULL,
	`cgst_total_paise` integer NOT NULL,
	`sgst_total_paise` integer NOT NULL,
	`grand_total_paise` integer NOT NULL,
	`finalized_at` text NOT NULL,
	`update_id` integer NOT NULL,
	`correlation_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `billing_bill_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`line_no` integer NOT NULL,
	`sku` text NOT NULL,
	`product_name` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit` text NOT NULL,
	`sell_price_paise` integer NOT NULL,
	`hsn_code` text NOT NULL,
	`gst_rate` integer NOT NULL,
	`taxable_paise` integer NOT NULL,
	`cgst_paise` integer NOT NULL,
	`sgst_paise` integer NOT NULL,
	`line_total_paise` integer NOT NULL,
	FOREIGN KEY (`bill_id`) REFERENCES `billing_bills`(`bill_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `khata_customers` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `khata_customers_normalized_name_unique` ON `khata_customers` (`normalized_name`);
--> statement-breakpoint
CREATE TABLE `khata_ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`entry_type` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`reference_type` text NOT NULL,
	`reference_id` text NOT NULL,
	`balance_after_paise` integer NOT NULL,
	`notes` text,
	`update_id` integer NOT NULL,
	`correlation_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `khata_customers`(`id`) ON UPDATE no action ON DELETE no action
);
