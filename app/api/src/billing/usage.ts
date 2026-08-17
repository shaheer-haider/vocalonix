/**
 * Usage measurement and the enforcement that hangs off it.
 *
 * This lives apart from `routes.ts` because the worker enforces the limit and
 * the worker has no business importing an Elysia route module — doing so pulled
 * the whole HTTP surface into the background process.
 */

import { and, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "../db/client";
import { businesses, callRecords, memberships } from "../db/schema";
import {
  resumeBusinessCalls,
  suspendBusinessCalls,
} from "../dograh/tenant";
import { UNLIMITED, effectivePlan } from "./plans";

/**
 * Start of the window usage is measured against. When a subscription is live
 * this is the current period start, which we derive from the period end Stripe
 * reported. Otherwise it is a rolling 30 days, so a workspace on Free still
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

export async function usageForBusiness(
  businessId: string,
  periodEnd: Date | null,
): Promise<{ minutesUsed: number; seatsUsed: number; windowStart: Date }> {
  const windowStart = usageWindowStart(periodEnd);
  const [minutes] = await db
    .select({
      seconds: sql<number>`coalesce(sum(${callRecords.durationSeconds}), 0)`,
    })
    .from(callRecords)
    .where(
      and(
        eq(callRecords.businessId, businessId),
        gte(callRecords.startedAt, windowStart),
      ),
    );
  const [seats] = await db
    .select({ count: sql<number>`count(*)` })
    .from(memberships)
    .where(
      and(
        eq(memberships.businessId, businessId),
        eq(memberships.status, "active"),
      ),
    );

  return {
    minutesUsed: Math.ceil(Number(minutes?.seconds ?? 0) / 60),
    seatsUsed: Number(seats?.count ?? 0),
    windowStart,
  };
}

interface PlanBearing {
  id: string;
  planName: string | null;
  planStatus: string | null;
  planPeriodEnd: Date | null;
}

/**
 * Whether a workspace has spent the minutes its plan includes.
 *
 * Pure measurement — acting on it is `reconcileBusinessUsage`.
 */
export async function callMinutesExhausted(
  business: PlanBearing,
): Promise<boolean> {
  const plan = effectivePlan(business);
  if (plan.monthlyMinutes === UNLIMITED) return false;
  const { minutesUsed } = await usageForBusiness(
    business.id,
    business.planPeriodEnd,
  );
  return minutesUsed >= plan.monthlyMinutes;
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
 * both decisions, not plumbing: suspending a workspace on an unlimited plan,
 * and re-suspending one that is already stopped on every single sweep — which
 * would deactivate its embed token once a minute forever.
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
 * Brings a workspace's ability to answer calls in line with what it has spent.
 *
 * Both directions matter and both are driven from the same measurement, so an
 * upgrade restores service by the same code path that took it away. Callers
 * that already know the business row pass it in; the worker sweep does.
 */
export async function reconcileBusinessUsage(
  businessOrId: string | (PlanBearing & { callsSuspendedAt: Date | null }),
): Promise<UsageReconciliation> {
  let business: (PlanBearing & { callsSuspendedAt: Date | null }) | undefined;
  if (typeof businessOrId === "string") {
    [business] = await db
      .select({
        id: businesses.id,
        planName: businesses.planName,
        planStatus: businesses.planStatus,
        planPeriodEnd: businesses.planPeriodEnd,
        callsSuspendedAt: businesses.callsSuspendedAt,
      })
      .from(businesses)
      .where(and(eq(businesses.id, businessOrId), isNull(businesses.deletedAt)))
      .limit(1);
  } else {
    business = businessOrId;
  }
  if (!business) return { changed: false, suspended: false };

  const suspended = business.callsSuspendedAt !== null;
  const plan = effectivePlan(business);
  const { minutesUsed } = await usageForBusiness(
    business.id,
    business.planPeriodEnd,
  );
  const action = suspensionDecision(plan.monthlyMinutes, minutesUsed, suspended);

  if (action === "none") return { changed: false, suspended };

  if (action === "suspend") {
    await suspendBusinessCalls(business.id);
    await db
      .update(businesses)
      .set({ callsSuspendedAt: new Date(), updatedAt: new Date() })
      .where(eq(businesses.id, business.id));
    return { changed: true, suspended: true };
  }

  await resumeBusinessCalls(business.id);
  await db
    .update(businesses)
    .set({ callsSuspendedAt: null, updatedAt: new Date() })
    .where(eq(businesses.id, business.id));
  return { changed: true, suspended: false };
}

/**
 * The worker's sweep.
 *
 * Only businesses that could plausibly change state are considered: one that
 * has never published has no token to revoke, and one already in the right
 * state costs a usage query and nothing else. A failure for one workspace must
 * not stop the rest, so each is caught individually.
 */
export async function reconcileAllUsage(): Promise<number> {
  const rows = await db
    .select({
      id: businesses.id,
      planName: businesses.planName,
      planStatus: businesses.planStatus,
      planPeriodEnd: businesses.planPeriodEnd,
      callsSuspendedAt: businesses.callsSuspendedAt,
    })
    .from(businesses)
    .where(isNull(businesses.deletedAt));

  let changed = 0;
  for (const row of rows) {
    try {
      const result = await reconcileBusinessUsage(row);
      if (result.changed) {
        changed += 1;
        console.log(
          result.suspended
            ? `Suspended calls for ${row.id}: plan minutes spent.`
            : `Resumed calls for ${row.id}: back inside plan minutes.`,
        );
      }
    } catch (caught) {
      console.error(`Usage reconciliation failed for ${row.id}:`, caught);
    }
  }
  return changed;
}

/** Kept for the readiness panel, which reports how many are currently stopped. */
export async function suspendedBusinessCount(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(businesses)
    .where(
      and(isNull(businesses.deletedAt), isNotNull(businesses.callsSuspendedAt)),
    );
  return Number(row?.count ?? 0);
}
