PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`round` integer NOT NULL,
	`project_name` text,
	`region` text,
	`detail` text,
	`email` text,
	`sido` text,
	`sigungu` text,
	`photos` text,
	`status` text DEFAULT 'new' NOT NULL,
	`memo` text,
	`ip_hash` text,
	`user_agent` text,
	`utm` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_reports`("id", "round", "project_name", "region", "detail", "email", "sido", "sigungu", "photos", "status", "memo", "ip_hash", "user_agent", "utm", "created_at") SELECT "id", "round", "project_name", "region", "detail", "email", "sido", "sigungu", NULL, "status", "memo", "ip_hash", "user_agent", "utm", "created_at" FROM `reports`;--> statement-breakpoint
DROP TABLE `reports`;--> statement-breakpoint
ALTER TABLE `__new_reports` RENAME TO `reports`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_reports_round` ON `reports` (`round`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_reports_status` ON `reports` (`status`);--> statement-breakpoint
CREATE INDEX `idx_reports_iphash` ON `reports` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_reports_sido` ON `reports` (`sido`);--> statement-breakpoint
CREATE INDEX `idx_reports_sigungu` ON `reports` (`sigungu`);
