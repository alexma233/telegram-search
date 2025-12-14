ALTER TABLE "joined_chats" ADD COLUMN "access_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "access_hash" text DEFAULT '' NOT NULL;