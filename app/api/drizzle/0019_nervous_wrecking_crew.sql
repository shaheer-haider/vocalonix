ALTER TABLE "businesses" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "plan_status" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "plan_period_end" timestamp with time zone;