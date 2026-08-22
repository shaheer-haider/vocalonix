import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../db/client";
import { businessPhoneNumbers, memberships } from "../db/schema";
import { ApiError } from "../errors";
import { accountForBusiness, businessCountForAccount, type BillingAccount } from "./account";
import { PHONE_NUMBERS_PER_BUSINESS, UNLIMITED, effectivePlan } from "./plans";

/**
 * Plan enforcement.
 *
 * These guard the things a customer can accumulate that cost real money or real
 * support: businesses, which each carry a phone number and a monthly carrier
 * charge; phone numbers themselves; and seats. All are checked at the moment of
 * acquisition, which is the only place a limit can be enforced without
 * stranding somebody who is already over — downgrading from Pro to Free must
 * not start deleting businesses or releasing numbers, so existing state is
 * always left alone and only growth is blocked.
 */

/**
 * What an account may run: the plan's allowance plus anything it has bought.
 *
 * Extras only count while the effective plan actually sells them. They are
 * priced against Pro, so a lapsed or cancelled subscription that falls back to
 * Free must not carry them across — otherwise a cancelled Pro that had bought
 * two extra businesses would keep three of them for nothing.
 */
export function businessAllowance(account: BillingAccount): number {
  const plan = effectivePlan(account);
  if (plan.businesses === UNLIMITED) return UNLIMITED;
  if (plan.additionalBusinessCents === null) return plan.businesses;
  return plan.businesses + account.extraBusinesses;
}

/**
 * A business is the unit the plan sells, so this is the limit that matters
 * most. Pro sells more of them outright; every plan can be over its allowance
 * after a downgrade, and that is deliberately survivable.
 */
export async function assertCanAddBusiness(
  account: BillingAccount,
): Promise<void> {
  const allowance = businessAllowance(account);
  if (allowance === UNLIMITED) return;

  const held = await businessCountForAccount(account.id);
  if (held < allowance) return;

  const plan = effectivePlan(account);
  const extra = plan.additionalBusinessCents;
  throw new ApiError(
    402,
    "PLAN_LIMIT_BUSINESSES",
    extra === null
      ? `The ${plan.name} plan covers ${allowance === 1 ? "one business" : `${allowance} businesses`}. Upgrade to add another.`
      : `You are using all ${allowance} of your businesses. Add another for $${(extra / 100).toFixed(0)} a month from Account & billing.`,
  );
}

/**
 * Whether this business may claim a number, and then how many.
 *
 * Two separate rules. The first is a plan lever: a number is a recurring
 * carrier charge on a real account, and a free tier that hands one to every
 * signup pays that charge forever against thirty minutes a month. The second is
 * a product rule — one business, one number — and is the same on every plan.
 *
 * Acquisition only, like every other limit here. A business that already holds
 * a number keeps it through a downgrade; nothing in this file ever releases
 * one, and a released number is not something a customer gets back.
 */
export async function assertCanAddPhoneNumber(business: {
  id: string;
}): Promise<void> {
  const account = await accountForBusiness(business.id);
  const plan = effectivePlan(account);
  if (!plan.phoneNumber) {
    throw new ApiError(
      402,
      "PLAN_PHONE_NOT_INCLUDED",
      `The ${plan.name} plan answers on your website only. Move up a plan to give this business a phone number of its own.`,
    );
  }

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
  if (held >= PHONE_NUMBERS_PER_BUSINESS) {
    throw new ApiError(
      402,
      "PLAN_LIMIT_PHONE_NUMBERS",
      "Each business has one phone number. Add another business to get another number.",
    );
  }
}

/** Seats are per business — a team belongs to a business, not to the account. */
export async function assertCanAddSeat(business: {
  id: string;
}): Promise<void> {
  const account = await accountForBusiness(business.id);
  const plan = effectivePlan(account);
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
      `The ${plan.name} plan includes ${plan.seats} team members per business. Upgrade to invite more.`,
    );
  }
}
