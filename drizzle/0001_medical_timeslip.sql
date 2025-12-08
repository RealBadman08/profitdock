CREATE TABLE `bot_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`asset` varchar(100) NOT NULL,
	`stake_amount` int NOT NULL,
	`strategy` varchar(100) NOT NULL,
	`max_loss` int,
	`max_profit` int,
	`trade_interval` int,
	`loss_multiplier` int,
	`is_active` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bot_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`file_key` varchar(512) NOT NULL,
	`url` text NOT NULL,
	`filename` varchar(255) NOT NULL,
	`mime_type` varchar(100),
	`file_size` int,
	`category` enum('strategy','log','config','other') NOT NULL DEFAULT 'other',
	`description` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `files_id` PRIMARY KEY(`id`)
);
