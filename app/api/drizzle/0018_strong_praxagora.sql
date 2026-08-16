CREATE TABLE "call_records" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"run_id" integer NOT NULL,
	"workflow_id" integer,
	"started_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer,
	"completed" boolean DEFAULT false NOT NULL,
	"mode" text,
	"disposition" text,
	"nodes_visited" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"has_transcript" boolean DEFAULT false NOT NULL,
	"has_recording" boolean DEFAULT false NOT NULL,
	"caller_number" text,
	"contact_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_records" ADD CONSTRAINT "call_records_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_records" ADD CONSTRAINT "call_records_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "call_records_business_run_unique" ON "call_records" USING btree ("business_id","run_id");--> statement-breakpoint
CREATE INDEX "call_records_business_started_idx" ON "call_records" USING btree ("business_id","started_at");