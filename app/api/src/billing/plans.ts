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
  /**
   * Display copy. It lives here rather than in the web app because the pricing
   * page, the in-app billing panel and the onboarding plan step all render the
   * same catalogue, and three copies of it would drift the moment a limit
   * changed.
   */
  tagline: string;
  features: string[];
  /** Drawn out as the default on the pricing page. Exactly one plan sets it. */
  highlighted?: boolean;
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
    tagline: "Hear it on your own website before you pay anything.",
    features: [
      "30 answered minutes a month",
      "Website widget and browser calls",
      "Your prices, hours and knowledge",
      "Bookings, callbacks and transcripts",
      "2 team members",
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceId: env.stripePriceStarter,
    amountCents: 4900,
    monthlyMinutes: 500,
    phoneNumbers: 1,
    seats: 5,
    tagline: "For a single location that wants every call answered.",
    features: [
      "500 answered minutes a month",
      "One real phone number",
      "Warm transfer to a person",
      "Knowledge gaps flagged for the morning",
      "5 team members",
    ],
    highlighted: true,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceId: env.stripePricePro,
    amountCents: 14900,
    monthlyMinutes: 2000,
    phoneNumbers: 3,
    seats: UNLIMITED,
    tagline: "For several locations, or one busy one.",
    features: [
      "2,000 answered minutes a month",
      "Up to 3 phone numbers",
      "Outbound callbacks from your own number",
      "Everything in Starter",
      "Unlimited team members",
    ],
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
