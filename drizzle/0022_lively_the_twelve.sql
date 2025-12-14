CREATE TABLE "avatars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text DEFAULT 'telegram' NOT NULL,
	"entity_type" text DEFAULT '' NOT NULL,
	"entity_id" text DEFAULT '' NOT NULL,
	"file_id" text DEFAULT '' NOT NULL,
	"avatar_bytes" "bytea",
	"storage_path" text DEFAULT '' NOT NULL,
	"mime_type" text DEFAULT '' NOT NULL,
	"created_at" bigint DEFAULT 0 NOT NULL,
	"updated_at" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "avatars_entity_unique_index" ON "avatars" USING btree ("platform","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "avatars_file_id_index" ON "avatars" USING btree ("file_id");