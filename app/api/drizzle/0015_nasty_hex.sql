CREATE TYPE "public"."phone_number_status" AS ENUM('pending', 'active', 'failed', 'released');--> statement-breakpoint
CREATE TABLE "business_phone_numbers" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"e164" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"country_code" text,
	"provider" text DEFAULT 'telnyx' NOT NULL,
	"dograh_config_id" integer,
	"dograh_phone_number_id" integer,
	"status" "phone_number_status" DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_agent_settings" ADD COLUMN "transfer_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_phone_numbers" ADD CONSTRAINT "business_phone_numbers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_phone_numbers" ADD CONSTRAINT "business_phone_numbers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_phone_numbers_business_idx" ON "business_phone_numbers" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_phone_numbers_e164_active_unique" ON "business_phone_numbers" USING btree ("e164") WHERE "business_phone_numbers"."status" <> 'released';