CREATE TABLE `bracket_picks` (
	`user_email` text NOT NULL,
	`match_slot` text NOT NULL,
	`team_id` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_email`, `match_slot`),
	FOREIGN KEY (`user_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `group_picks` (
	`user_email` text NOT NULL,
	`group_letter` text NOT NULL,
	`rank` integer NOT NULL,
	`team_id` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_email`, `group_letter`, `rank`),
	FOREIGN KEY (`user_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lineup_picks` (
	`user_email` text NOT NULL,
	`round` text NOT NULL,
	`position` text NOT NULL,
	`player_id` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_email`, `round`, `position`),
	FOREIGN KEY (`user_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` integer PRIMARY KEY NOT NULL,
	`stage` text NOT NULL,
	`group_letter` text,
	`home_team_id` integer,
	`away_team_id` integer,
	`kickoff_utc` integer NOT NULL,
	`home_score` integer,
	`away_score` integer,
	`status` text NOT NULL,
	`ingested_at` integer,
	`raw_events` text,
	FOREIGN KEY (`home_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`away_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `matches_kickoff_idx` ON `matches` (`kickoff_utc`);--> statement-breakpoint
CREATE INDEX `matches_stage_status_idx` ON `matches` (`stage`,`status`);--> statement-breakpoint
CREATE TABLE `odds_snapshots` (
	`market` text NOT NULL,
	`snapshot_at` integer NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`market`, `snapshot_at`)
);
--> statement-breakpoint
CREATE TABLE `scores` (
	`user_email` text NOT NULL,
	`category` text NOT NULL,
	`key` text NOT NULL,
	`points` integer NOT NULL,
	`computed_at` integer NOT NULL,
	PRIMARY KEY(`user_email`, `category`, `key`),
	FOREIGN KEY (`user_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `scores_user_idx` ON `scores` (`user_email`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`flag` text,
	`group_letter` text NOT NULL,
	`coach` text,
	`api_sports_data` text
);
--> statement-breakpoint
CREATE INDEX `teams_group_idx` ON `teams` (`group_letter`);--> statement-breakpoint
CREATE TABLE `tournament_picks` (
	`user_email` text PRIMARY KEY NOT NULL,
	`winner_team_id` integer,
	`top_scorer_player_id` integer,
	`golden_glove_player_id` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`winner_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`avatar_emoji` text,
	`is_admin` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wildcard_picks` (
	`user_email` text NOT NULL,
	`slot` integer NOT NULL,
	`team_id` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_email`, `slot`),
	FOREIGN KEY (`user_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
