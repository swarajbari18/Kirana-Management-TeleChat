CREATE TABLE `khata_customer_aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` text NOT NULL,
	`alias` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `khata_customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `khata_customer_aliases_customer_alias` ON `khata_customer_aliases` (`customer_id`,`alias`);--> statement-breakpoint
CREATE UNIQUE INDEX `khata_ledger_bill_credit_sale` ON `khata_ledger_entries` (`reference_type`,`reference_id`,`entry_type`);
