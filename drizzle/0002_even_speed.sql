CREATE TABLE `leaderboard` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`username` varchar(255) NOT NULL,
	`total_trades` int NOT NULL DEFAULT 0,
	`won_trades` int NOT NULL DEFAULT 0,
	`lost_trades` int NOT NULL DEFAULT 0,
	`total_profit` int NOT NULL DEFAULT 0,
	`win_rate` int NOT NULL DEFAULT 0,
	`last_updated` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leaderboard_id` PRIMARY KEY(`id`),
	CONSTRAINT `leaderboard_user_id_unique` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `trades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`contract_id` varchar(255) NOT NULL,
	`symbol` varchar(100) NOT NULL,
	`contract_type` varchar(50) NOT NULL,
	`stake` int NOT NULL,
	`payout` int,
	`profit` int,
	`status` enum('open','won','lost') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`closed_at` timestamp,
	CONSTRAINT `trades_id` PRIMARY KEY(`id`)
);
