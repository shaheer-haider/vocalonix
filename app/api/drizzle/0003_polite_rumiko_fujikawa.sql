CREATE TYPE "public"."knowledge_kind" AS ENUM('document', 'text', 'website_reference');--> statement-breakpoint
CREATE TYPE "public"."knowledge_state" AS ENUM('pending', 'uploading', 'processing', 'active', 'failed', 'delete_pending', 'deleted');--> statement-breakpoint
ALTER TYPE "public"."dograh_sync_state" ADD VALUE 'offboarding';--> statement-breakpoint
ALTER TYPE "public"."dograh_sync_state" ADD VALUE 'offboarded';--> statement-breakpoint
CREATE TABLE "business_agent_settings" (
	"business_id" text PRIMARY KEY NOT NULL,
	"agent_name" text DEFAULT 'Nova' NOT NULL,
	"greeting" text DEFAULT 'Hi, thanks for visiting. I am Nova. How can I help you today?' NOT NULL,
	"prompt" text DEFAULT 'Answer clearly from saved business context and attached knowledge. If the answer is unknown, say a team member can follow up instead of guessing.' NOT NULL,
	"closing" text DEFAULT 'Thanks for visiting. Have a great day.' NOT NULL,
	"tone" text DEFAULT 'warm' NOT NULL,
	"voice" text DEFAULT 'natural' NOT NULL,
	"allow_interrupt" boolean DEFAULT true NOT NULL,
	"escalation_guidance" text DEFAULT 'Offer to have a team member follow up when a request needs human help.' NOT NULL,
	"business_hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"widget_button_text" text DEFAULT 'Talk to us' NOT NULL,
	"widget_color" text DEFAULT '#5b5bd6' NOT NULL,
	"allowed_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_knowledge" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"kind" "knowledge_kind" NOT NULL,
	"title" text NOT NULL,
	"source_text" text,
	"source_bytes" "bytea",
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"retrieval_mode" text DEFAULT 'chunked' NOT NULL,
	"remote_document_uuid" text,
	"state" "knowledge_state" DEFAULT 'pending' NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"replaces_knowledge_id" text,
	"last_error" text,
	"next_retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "business_onboarding" (
	"business_id" text PRIMARY KEY NOT NULL,
	"completed_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_step" text DEFAULT 'business-profile' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_dograh_mappings" ADD COLUMN "config_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "business_dograh_mappings" ADD COLUMN "synced_config_hash" text;--> statement-breakpoint
ALTER TABLE "business_dograh_mappings" ADD COLUMN "error_category" text;--> statement-breakpoint
ALTER TABLE "business_dograh_mappings" ADD COLUMN "sync_lease_id" text;--> statement-breakpoint
ALTER TABLE "business_dograh_mappings" ADD COLUMN "sync_lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "business_dograh_mappings" ADD COLUMN "retry_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "business_dograh_mappings" ADD COLUMN "offboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "max_attempts" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "available_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "business_agent_settings" ADD CONSTRAINT "business_agent_settings_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_knowledge" ADD CONSTRAINT "business_knowledge_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_onboarding" ADD CONSTRAINT "business_onboarding_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_knowledge_business_idx" ON "business_knowledge" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "business_knowledge_state_idx" ON "business_knowledge" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "business_knowledge_remote_uuid_unique" ON "business_knowledge" USING btree ("remote_document_uuid");--> statement-breakpoint
CREATE INDEX "outbox_events_available_idx" ON "outbox_events" USING btree ("status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_dedupe_key_active_unique" ON "outbox_events" USING btree ("dedupe_key") WHERE "outbox_events"."status" in ('pending', 'processing');