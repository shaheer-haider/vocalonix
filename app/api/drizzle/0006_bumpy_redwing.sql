CREATE TYPE "public"."callback_source" AS ENUM('call', 'manual');--> statement-breakpoint
CREATE TYPE "public"."callback_status" AS ENUM('open', 'spoke', 'voicemail', 'dropped');--> statement-breakpoint
CREATE TABLE "callback_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"contact_name" text NOT NULL,
	"contact_channel" text NOT NULL,
	"reason" text NOT NULL,
	"source" "callback_source" DEFAULT 'manual' NOT NULL,
	"run_id" integer,
	"promised_at" timestamp with time zone NOT NULL,
	"assigned_to" text,
	"status" "callback_status" DEFAULT 'open' NOT NULL,
	"attempts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "callback_tasks" ADD CONSTRAINT "callback_tasks_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "callback_tasks" ADD CONSTRAINT "callback_tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "callback_tasks" ADD CONSTRAINT "callback_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "callback_tasks_business_status_idx" ON "callback_tasks" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "callback_tasks_business_promised_idx" ON "callback_tasks" USING btree ("business_id","promised_at");