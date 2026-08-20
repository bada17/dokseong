CREATE TABLE `participations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` text NOT NULL,
	`campaign_name` text,
	`round` integer,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`consent_privacy` integer DEFAULT 0 NOT NULL,
	`consent_news` integer DEFAULT 0 NOT NULL,
	`consent_version` text,
	`consented_at` text,
	`ip_hash` text,
	`user_agent` text,
	`utm` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_part_unique` ON `participations` (`campaign_id`,`email`);--> statement-breakpoint
CREATE INDEX `idx_part_campaign` ON `participations` (`campaign_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`round` integer NOT NULL,
	`project_name` text NOT NULL,
	`region` text,
	`detail` text NOT NULL,
	`email` text,
	`sido` text,
	`sigungu` text,
	`status` text DEFAULT 'new' NOT NULL,
	`memo` text,
	`ip_hash` text,
	`user_agent` text,
	`utm` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reports_round` ON `reports` (`round`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_reports_status` ON `reports` (`status`);--> statement-breakpoint
CREATE INDEX `idx_reports_iphash` ON `reports` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_reports_sido` ON `reports` (`sido`);--> statement-breakpoint
CREATE INDEX `idx_reports_sigungu` ON `reports` (`sigungu`);