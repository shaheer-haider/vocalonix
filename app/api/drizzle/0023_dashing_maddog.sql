-- Move billing from the business to the account, carrying existing state with it.
--
-- The drops below are irreversible, so the backfill has to run first and in the
-- same migration. One account per owner: `DISTINCT ON` picks a single business
-- to inherit plan state from, preferring one that actually has a subscription
-- so an owner with a paid business and an unpaid one keeps the paid state.
INSERT INTO "billing_accounts" (
  "id", "owner_user_id", "stripe_customer_id", "plan_name",
  "stripe_subscription_id", "plan_status", "plan_period_end", "calls_suspended_at"
)
SELECT DISTINCT ON ("created_by")
  gen_random_uuid()::text,
  "created_by",
  "stripe_customer_id",
  "plan_name",
  "stripe_subscription_id",
  "plan_status",
  "plan_period_end",
  "calls_suspended_at"
FROM "businesses"
WHERE "deleted_at" IS NULL
ORDER BY "created_by",
         ("stripe_subscription_id" IS NOT NULL) DESC,
         ("plan_name" IS NOT NULL) DESC,
         "created_at" ASC
ON CONFLICT ("owner_user_id") DO NOTHING;
--> statement-breakpoint
UPDATE "businesses" b
SET "billing_account_id" = a."id"
FROM "billing_accounts" a
WHERE a."owner_user_id" = b."created_by"
  AND b."billing_account_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "businesses" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "businesses" DROP COLUMN "plan_name";--> statement-breakpoint
ALTER TABLE "businesses" DROP COLUMN "stripe_subscription_id";--> statement-breakpoint
ALTER TABLE "businesses" DROP COLUMN "plan_status";--> statement-breakpoint
ALTER TABLE "businesses" DROP COLUMN "plan_period_end";--> statement-breakpoint
ALTER TABLE "businesses" DROP COLUMN "calls_suspended_at";
