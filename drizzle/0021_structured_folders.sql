CREATE TABLE "chat_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"telegram_folder_id" integer NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"emoticon" text,
	"created_at" bigint DEFAULT 0 NOT NULL,
	"updated_at" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_folders" ADD CONSTRAINT "chat_folders_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "chat_folders_account_folder_unique_index" ON "chat_folders" USING btree ("account_id","telegram_folder_id");
--> statement-breakpoint
CREATE TABLE "chat_folder_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_folder_id" uuid NOT NULL,
	"joined_chat_id" uuid NOT NULL,
	"created_at" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_folder_chats" ADD CONSTRAINT "chat_folder_chats_chat_folder_id_chat_folders_id_fk" FOREIGN KEY ("chat_folder_id") REFERENCES "public"."chat_folders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chat_folder_chats" ADD CONSTRAINT "chat_folder_chats_joined_chat_id_joined_chats_id_fk" FOREIGN KEY ("joined_chat_id") REFERENCES "public"."joined_chats"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "chat_folder_chats_folder_chat_unique_index" ON "chat_folder_chats" USING btree ("chat_folder_id","joined_chat_id");
