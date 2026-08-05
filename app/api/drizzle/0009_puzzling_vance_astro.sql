CREATE TYPE "public"."knowledge_gap_status" AS ENUM('open', 'answered', 'dismissed');--> statement-breakpoint
CREATE TABLE "knowledge_gaps" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"normalized_question" text NOT NULL,
	"question" text NOT NULL,
	"agent_response" text DEFAULT '' NOT NULL,
	"ask_count" integer DEFAULT 1 NOT NULL,
	"run_id" integer,
	"status" "knowledge_gap_status" DEFAULT 'open' NOT NULL,
	"last_asked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_gaps" ADD CONSTRAINT "knowledge_gaps_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_gaps" ADD CONSTRAINT "knowledge_gaps_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_gaps_business_question_unique" ON "knowledge_gaps" USING btree ("business_id","normalized_question");--> statement-breakpoint
CREATE INDEX "knowledge_gaps_business_status_idx" ON "knowledge_gaps" USING btree ("business_id","status");