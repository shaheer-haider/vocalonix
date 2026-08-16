import { env } from "../env";

/**
 * The plan catalogue.
 *
 * Price ids live in the environment rather than in this file so that moving to
 * a different Stripe account — which is the plan once the product has its own
 * LLC — is a deploy-time change and not a code change. A plan whose price id is
 * unset is simply not offered for purchase, which is also how a deployment with
 * no billing configured behaves.
 *
 * Limits are expressed as numbers, with `UNLIMITED` for the absent ceiling, so
 * a comparison never has to special-case `null`.
 */
export const UNLIMITED = Number.POSITIVE_INFINITY;

export type PlanId = "free" | "starter" | "pro";

export interface Plan {
  id: PlanId;
  name: string;
  /** Stripe price id, or null when this plan cannot be bought. */
  priceId: string | null;
  /** Monthly price in minor units, for display only; Stripe remains the source of truth. */
  amountCents: number;
  /** Answered-call minutes included per billing period. */
  monthlyMinutes: number;
  /** Phone numbers the workspace may hold at once. */
  phoneNumbers: number;
  /** Members with access to the workspace, including the owner. */
  seats: number;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceId: null,
    amountCents: 0,
    monthlyMinutes: 30,
    phoneNumbers: 1,
    seats: 2,
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceId: env.stripePriceStarter,
    amountCents: 4900,
    monthlyMinutes: 500,
    phoneNumbers: 1,
    seats: 5,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceId: env.stripePricePro,
    amountCents: 14900,
    monthlyMinutes: 2000,
    phoneNumbers: 3,
    seats: UNLIMITED,
  },
};

export const FREE_PLAN = PLANS.free;

/**
 * Subscription states Stripe can report. Anything that is not `active` or
 * `trialing` means the workspace has lost its paid entitlements, so the
 * effective plan falls back to Free rather than staying on what was bought.
 */
export type PlanStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete";

export function isEntitled(status: PlanStatus | null): boolean {
  return status === "active" || status === "trialing";
}

export function planById(id: string | null | undefined): Plan {
  if (!id) return FREE_PLAN;
  return PLANS[id as PlanId] ?? FREE_PLAN;
}

/** The plan a workspace is actually entitled to right now. */
export function effectivePlan(business: {
  planName: string | null;
  planStatus: string | null;
}): Plan {
  if (!isEntitled(business.planStatus as PlanStatus | null)) return FREE_PLAN;
  return planById(business.planName);
}

export function planByPriceId(priceId: string | null): Plan | null {
  if (!priceId) return null;
  return (
    Object.values(PLANS).find((plan) => plan.priceId === priceId) ?? null
  );
}

/** Plans a customer can actually buy on this deployment. */
export function purchasablePlans(): Plan[] {
  return Object.values(PLANS).filter((plan) => plan.priceId !== null);
}
