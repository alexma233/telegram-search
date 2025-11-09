CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"progress" bigint DEFAULT 0 NOT NULL,
	"last_message" text,
	"last_error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" bigint DEFAULT 0 NOT NULL,
	"updated_at" bigint DEFAULT 0 NOT NULL,
	"completed_at" bigint,
	CONSTRAINT "tasks_task_id_unique" UNIQUE("task_id")
);
--> statement-breakpoint
CREATE INDEX "tasks_task_id_index" ON "tasks" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "tasks_status_index" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_type_index" ON "tasks" USING btree ("type");--> statement-breakpoint
CREATE INDEX "tasks_created_at_index" ON "tasks" USING btree ("created_at");