ALTER TABLE `execution_ledger` RENAME COLUMN `delivered` TO `handed_to_worker`;
--> statement-breakpoint
ALTER TABLE `execution_ledger` ADD `telegram_delivered` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `execution_ledger` ADD `result_json` text;
