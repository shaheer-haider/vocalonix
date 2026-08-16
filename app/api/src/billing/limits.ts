import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../db/client";
import { businessPhoneNumbers, memberships } from "../db/schema";
import { ApiError } from "../errors";
import { UNLIMITED, effectivePlan } from "./plans";

/**
 * Plan enforcement.
 *
 * These guard the two things a workspace can accumulate that cost real money or
 * real support: phone numbers, which carry a monthly charge from the carrier,
 * and seats. Both are checked at the moment of acquisition, which is the only
 * place a limit can be enforced without stranding a workspace that is already
 * over — downgrading someone from Pro to Free must not start deleting their
 * numbers, so existing state is always left alone and only growth is blocked.
 */

interface PlanBearing {
  id: string;
  planName: string | null;
  planStatus: string | null;
}

export async function assertCanAddPhoneNumber(
  business: PlanBearing,
): Promise<void> {
  const plan = effectivePlan(business);
  if (plan.phoneNumbers === UNLIMITED) return;

  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(businessPhoneNumbers)
    .where(
      and(
        eq(businessPhoneNumbers.businessId, business.id),
        isNull(businessPhoneNumbers.releasedAt),
      ),
    );

  const held = Number(row?.count ?? 0);
  if (held >= plan.phoneNumbers) {
    throw new ApiError(
      402,
      "PLAN_LIMIT_PHONE_NUMBERS",
      plan.phoneNumbers === 1
        ? `The ${plan.name} plan includes one phone number. Upgrade to add another.`
        : `The ${plan.name} plan includes ${plan.phoneNumbers} phone numbers. Upgrade to add another.`,
    );
  }
}

export async function assertCanAddSeat(business: PlanBearing): Promise<void> {
  const plan = effectivePlan(business);
  if (plan.seats === UNLIMITED) return;

  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(memberships)
    .where(
      and(
        eq(memberships.businessId, business.id),
        eq(memberships.status, "active"),
      ),
    );

  const used = Number(row?.count ?? 0);
  if (used >= plan.seats) {
    throw new ApiError(
      402,
      "PLAN_LIMIT_SEATS",
      `The ${plan.name} plan includes ${plan.seats} team members. Upgrade to invite more.`,
    );
  }
}
