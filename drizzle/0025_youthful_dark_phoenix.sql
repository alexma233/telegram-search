CREATE TABLE "annual_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"stats" jsonb,
	"plan" jsonb,
	"totalCount" integer DEFAULT 0,
	"processedCount" integer DEFAULT 0,
	"updatedAt" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "annual_reports" ADD CONSTRAINT "annual_reports_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "annual_reports_account_id_year_unique_index" ON "annual_reports" USING btree ("account_id","year");