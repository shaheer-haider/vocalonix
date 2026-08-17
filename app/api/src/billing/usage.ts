/**
 * Usage measurement and the enforcement that hangs off it.
 *
 * This lives apart from `routes.ts` because the worker enforces the limit and
 * the worker has no business importing an Elysia route module — doing so pulled
 * the whole HTTP surface into the background process.
 *
 * Minutes are pooled across the account rather than counted per business: one
 * subscription covers several businesses, so a Pro account with three of them
 * spends one allowance between them.
 */

import { and, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "../db/client";
import { billingAccounts, businesses, callRecords, memberships } from "../db/schema";
import {
  resumeBusinessCalls,
  suspendBusinessCalls,
} from "../dograh/tenant";
import {
  accountForBusiness,
  businessesForAccount,
  type BillingAccount,
} from "./account";
import { UNLIMITED, effectivePlan } from "./plans";

/**
 * Start of the window usage is measured against. When a subscription is live
 * this is the current period start, which we derive from the period end Stripe
 * reported. Otherwise it is a rolling 30 days, so an account on Free still
 * sees a number that means something.
 */
export function usageWindowStart(periodEnd: Date | null): Date {
  const now = Date.now();
  if (periodEnd && periodEnd.getTime() > now) {
    const start = new Date(periodEnd);
    start.setMonth(start.getMonth() - 1);
    return start;
  }
  return new Date(now - 30 * 24 * 60 * 60 * 1000);
}

export interface AccountUsage {
  minutesUsed: number;
  seatsUsed: number;
  businessesUsed: number;
  windowStart: Date;
}

/**
 * What the account has spent this period, across every business it pays for.
 *
 * `seatsUsed` counts distinct people rather than membership rows, so somebody
 * on two of the account's businesses is one person and not two.
 */
export async function usageForAccount(
  accountId: string,
  periodEnd: Date | null,
): Promise<AccountUsage> {
  const windowStart = usageWindowStart(periodEnd);
  const owned = await businessesForAccount(accountId);
  const ids = owned.map((row) => row.id);

  if (ids.length === 0) {
    return { minutesUsed: 0, seatsUsed: 0, businessesUsed: 0, windowStart };
  }

  const [minutes] = await db
    .select({
      seconds: sql<number>`coalesce(sum(${callRecords.durationSeconds}), 0)`,
    })
    .from(callRecords)
    .where(
      and(
        inArray(callRecords.businessId, ids),
        gte(callRecords.startedAt, windowStart),
      ),
    );

  const [seats] = await db
    .select({
      count: sql<number>`count(distinct ${memberships.userId})`,
    })
    .from(memberships)
    .where(
      and(
        inArray(memberships.businessId, ids),
        eq(memberships.status, "active"),
      ),
    );

  return {
    minutesUsed: Math.ceil(Number(minutes?.seconds ?? 0) / 60),
    seatsUsed: Number(seats?.count ?? 0),
    businessesUsed: ids.length,
    windowStart,
  };
}

/** Convenience for callers that hold a business rather than an account. */
export async function usageForBusinessAccount(
  businessId: string,
): Promise<{ account: BillingAccount; usage: AccountUsage }> {
  const account = await accountForBusiness(businessId);
  return {
    account,
    usage: await usageForAccount(account.id, account.planPeriodEnd),
  };
}

export interface UsageReconciliation {
  changed: boolean;
  suspended: boolean;
}

export type SuspensionAction = "suspend" | "resume" | "none";

/**
 * The whole enforcement rule, with no database and no engine attached.
 *
 * Kept pure and separate because the two mistakes worth guarding against are
 * both decisions, not plumbing: suspending an account on an unlimited plan,
 * and re-suspending one that is already stopped on every single sweep — which
 * would deactivate its embed tokens once a minute forever.
 */
export function suspensionDecision(
  allowanceMinutes: number,
  minutesUsed: number,
  currentlySuspended: boolean,
): SuspensionAction {
  const exhausted =
    allowanceMinutes !== UNLIMITED && minutesUsed >= allowanceMinutes;
  if (exhausted === currentlySuspended) return "none";
  return exhausted ? "suspend" : "resume";
}

/**
 * Brings an account's ability to answer calls in line with what it has spent.
 *
 * Both directions matter and both are driven from the same measurement, so an
 * upgrade restores service by the same code path that took it away. Every
 * business the account owns moves together, because they share the allowance.
 */
export async function reconcileAccountUsage(
  accountOrId: string | BillingAccount,
): Promise<UsageReconciliation> {
  let account: BillingAccount | undefined;
  if (typeof accountOrId === "string") {
    [account] = await db
      .select()
      .from(billingAccounts)
      .where(eq(billingAccounts.id, accountOrId))
      .limit(1);
  } else {
    account = accountOrId;
  }
  if (!account) return { changed: false, suspended: false };

  const suspended = account.callsSuspendedAt !== null;
  const plan = effectivePlan(account);
  const { minutesUsed } = await usageForAccount(
    account.id,
    account.planPeriodEnd,
  );
  const action = suspensionDecision(plan.monthlyMinutes, minutesUsed, suspended);

  if (action === "none") return { changed: false, suspended };

  const owned = await businessesForAccount(account.id);
  for (const business of owned) {
    if (action === "suspend") await suspendBusinessCalls(business.id);
    else await resumeBusinessCalls(business.id);
  }

  await db
    .update(billingAccounts)
    .set({
      callsSuspendedAt: action === "suspend" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(billingAccounts.id, account.id));

  return { changed: true, suspended: action === "suspend" };
}

/**
 * The worker's sweep.
 *
 * A failure for one account must not stop the rest, so each is caught
 * individually.
 */
export async function reconcileAllUsage(): Promise<number> {
  const accounts = await db.select().from(billingAccounts);

  let changed = 0;
  for (const account of accounts) {
    try {
      const result = await reconcileAccountUsage(account);
      if (result.changed) {
        changed += 1;
        console.log(
          result.suspended
            ? `Suspended calls for account ${account.id}: plan minutes spent.`
            : `Resumed calls for account ${account.id}: back inside plan minutes.`,
        );
      }
    } catch (caught) {
      console.error(`Usage reconciliation failed for account ${account.id}:`, caught);
    }
  }
  return changed;
}

/** Kept for the readiness panel, which reports how many are currently stopped. */
export async function suspendedAccountCount(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(billingAccounts)
    .where(isNotNull(billingAccounts.callsSuspendedAt));
  return Number(row?.count ?? 0);
}

/** Businesses with no account yet — only possible for rows predating the column. */
export async function linkOrphanedBusinesses(): Promise<number> {
  const orphans = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(
      and(isNull(businesses.billingAccountId), isNull(businesses.deletedAt)),
    );
  for (const orphan of orphans) {
    // Reading through to the creator's account is what links it.
    await accountForBusiness(orphan.id).catch((caught: unknown) => {
      console.error(`Could not link business ${orphan.id} to an account:`, caught);
    });
  }
  return orphans.length;
}
