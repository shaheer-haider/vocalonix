CREATE TABLE "business_config_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"version" integer NOT NULL,
	"config" jsonb NOT NULL,
	"published_by" text,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_config_versions" ADD CONSTRAINT "business_config_versions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_config_versions" ADD CONSTRAINT "business_config_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "business_config_versions_business_version_unique" ON "business_config_versions" USING btree ("business_id","version");--> statement-breakpoint
CREATE INDEX "business_config_versions_business_idx" ON "business_config_versions" USING btree ("business_id","published_at");