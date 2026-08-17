CREATE TABLE "billing_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"stripe_customer_id" text,
	"plan_name" text,
	"stripe_subscription_id" text,
	"plan_status" text,
	"plan_period_end" timestamp with time zone,
	"extra_businesses" integer DEFAULT 0 NOT NULL,
	"calls_suspended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "billing_account_id" text;--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_accounts_owner_unique" ON "billing_accounts" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "billing_accounts_stripe_customer_idx" ON "billing_accounts" USING btree ("stripe_customer_id");--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_billing_account_id_billing_accounts_id_fk" FOREIGN KEY ("billing_account_id") REFERENCES "public"."billing_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "businesses_billing_account_idx" ON "businesses" USING btree ("billing_account_id");