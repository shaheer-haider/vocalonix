CREATE TABLE "demo_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"vertical" text NOT NULL,
	"status" text DEFAULT 'intake_started' NOT NULL,
	"business_name" text,
	"city" text,
	"services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"booking_tool" text,
	"vertical_answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"full_name" text,
	"email" text,
	"phone" text,
	"demo_mode" text,
	"workflow_id" integer,
	"duration_seconds" integer,
	"transcript" jsonb,
	"recording_url" text,
	"cost_usd" text,
	"feedback_score" integer,
	"feedback_chips" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"feedback_text" text,
	"outcome" text,
	"ip_address" text,
	"user_agent" text,
	"referrer" text
);
--> statement-breakpoint
CREATE INDEX "demo_sessions_email_idx" ON "demo_sessions" USING btree ("email");--> statement-breakpoint
CREATE INDEX "demo_sessions_status_idx" ON "demo_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "demo_sessions_created_at_idx" ON "demo_sessions" USING btree ("created_at");