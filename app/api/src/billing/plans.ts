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
 *
 * A plan is bought once per **account** and covers several businesses. That is
 * why `businesses` is a plan dimension at all: "Pro includes 3 businesses" is
 * meaningless if the subscription hangs off a business, because you would buy
 * Pro once per business and the allowance could never be anything but one.
 */
export const UNLIMITED = Number.POSITIVE_INFINITY;

/**
 * One business, one phone number. How *many* numbers a business may hold is a
 * product rule and the same on every plan; **whether** it may hold one at all
 * is `Plan.phoneNumber`. More numbers means more businesses, which is what the
 * `businesses` allowance sells.
 */
export const PHONE_NUMBERS_PER_BUSINESS = 1;

/**
 * What a receptionist call actually costs in minutes, used to translate an
 * allowance into the unit the buyer thinks in.
 *
 * Nobody running a plumbing business thinks in minutes; they think in calls
 * answered. "What counts as a minute?" being the first question on the pricing
 * page is the evidence — a page should not have to explain its own unit.
 *
 * An estimate, and marked as one everywhere it is shown. **Replace it with the
 * measured figure once there is real traffic**: the query is a median over
 * `call_records.duration_seconds`. Quoting calls a customer does not get is the
 * kind of promise this codebase has already had to walk back once.
 */
export const AVERAGE_CALL_MINUTES = 2.5;

/**
 * The launch offer, or null once it is over.
 *
 * Nullable rather than deleted so that ending it is one line here instead of an
 * edit to the pricing page, the landing page and the onboarding plan step —
 * which is the same reason plan copy lives in this file at all.
 *
 * The price promise keeps itself: Stripe holds a subscription on the price it
 * was created with, and a price's amount cannot be edited. Raising the price
 * therefore means creating a **new** Stripe price and pointing
 * `STRIPE_PRICE_STARTER` at it, which leaves every founding subscription
 * exactly where it is. Do not migrate existing subscriptions onto the new
 * price; that is the one action that would break this.
 */
export interface FoundingOffer {
  /** Plan the launch price applies to. */
  planId: PlanId;
  /** How many businesses keep it. */
  limit: number;
  /** What that plan costs once the founding places are gone, in minor units. */
  futureAmountCents: number;
  /** Days in which a new subscription can be refunded in full. */
  refundDays: number;
}

export const FOUNDING_OFFER: FoundingOffer | null = {
  planId: "starter",
  limit: 50,
  futureAmountCents: 9900,
  refundDays: 30,
};

export type PlanId = "free" | "starter" | "pro";

export interface Plan {
  /**
   * Infrastructure identifier. It reaches Stripe (product `harkbell_starter`,
   * `STRIPE_PRICE_STARTER`) and is the value stored in `plan_name`, so it does
   * not follow the display name when that is reworded — the same split the
   * repo already makes between Harkbell and vocalonix.
   */
  id: PlanId;
  /** What a customer sees. Safe to change. */
  name: string;
  /** Stripe price id, or null when this plan cannot be bought. */
  priceId: string | null;
  /** Monthly price in minor units, for display only; Stripe remains the source of truth. */
  amountCents: number;
  /** Answered-call minutes included per period, pooled across the account. */
  monthlyMinutes: number;
  /** Businesses the account may run at once. */
  businesses: number;
  /**
   * Whether this plan may claim a phone number at all.
   *
   * A number is a recurring carrier charge against a real account, so giving
   * one away with a free tier means every signup can hold one indefinitely on
   * thirty minutes a month. It is also the single gate behind warm transfer and
   * outbound callbacks — both are refused without a live number — so this one
   * flag is what makes the Essential feature list true rather than aspirational.
   */
  phoneNumber: boolean;
  /**
   * Charged monthly for each business beyond the included allowance, or null
   * when the plan does not sell extras at all.
   */
  additionalBusinessCents: number | null;
  /** Members with access to one business, including the owner. */
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
    businesses: 1,
    phoneNumber: false,
    additionalBusinessCents: null,
    seats: 2,
    tagline: "Hear it on your own website before you pay anything.",
    features: [
      "30 answered minutes a month",
      "Website widget and browser calls",
      "Bookings, callbacks and transcripts",
      "Knowledge gaps collected in your dashboard",
      "2 team members",
    ],
  },
  starter: {
    // `starter` is the Stripe product and the stored plan id; "Essential" is
    // only what the customer reads.
    id: "starter",
    name: "Essential",
    priceId: env.stripePriceStarter,
    amountCents: 4900,
    monthlyMinutes: 500,
    businesses: 1,
    phoneNumber: true,
    additionalBusinessCents: null,
    seats: 10,
    tagline: "Everything one business needs to stop missing calls.",
    features: [
      "Everything in Free",
      "500 answered minutes a month",
      "A real phone number that rings your agent",
      "Warm transfer to a person, and outbound callbacks",
      "10 team members",
    ],
    highlighted: true,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceId: env.stripePricePro,
    amountCents: 14900,
    monthlyMinutes: 2000,
    businesses: 3,
    phoneNumber: true,
    additionalBusinessCents: 1900,
    seats: UNLIMITED,
    tagline: "For a group of locations under one roof.",
    features: [
      "Everything in Essential",
      "2,000 answered minutes a month",
      "Three businesses, each with its own number and team",
      "$19 a month for each business after that",
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

/**
 * Roughly how many calls an allowance covers.
 *
 * Rounded down and to something a person would say out loud — "about 200
 * calls" rather than "200.0". Rounding *down* on purpose: an allowance that
 * covers slightly more than advertised is a good surprise, and the reverse is a
 * complaint.
 */
export function estimatedCallsFor(plan: Plan): number | null {
  if (plan.monthlyMinutes === UNLIMITED) return null;
  const calls = Math.floor(plan.monthlyMinutes / AVERAGE_CALL_MINUTES);
  if (calls < 20) return calls;
  const step = calls < 100 ? 5 : calls < 500 ? 10 : 50;
  return Math.floor(calls / step) * step;
}

/** Plans a customer can actually buy on this deployment. */
export function purchasablePlans(): Plan[] {
  return Object.values(PLANS).filter((plan) => plan.priceId !== null);
}

/**
 * The cheapest of `candidates` that would actually give this plan more minutes.
 *
 * Pure, and separate from the catalogue lookup below, because the interesting
 * case is not "which plan" but "no plan" — and that answer depends on the
 * environment, which a unit test cannot set.
 */
export function higherPlanThan(plan: Plan, candidates: Plan[]): Plan | null {
  return (
    candidates
      .filter((candidate) => candidate.monthlyMinutes > plan.monthlyMinutes)
      .sort((a, b) => a.amountCents - b.amountCents)[0] ?? null
  );
}

/**
 * The plan to point somebody at when they have run out, or null when there is
 * nowhere to point them.
 *
 * Every "you have run out, upgrade" message needs this. The top plan has
 * nowhere to go, and telling somebody on it to move up is the same dead end as
 * a "Talk to us" button pointing at the signup form. It is null on a deployment
 * with no Stripe price ids too, where nothing can be bought at all — there the
 * honest instruction really is "email us".
 */
export function nextPlanUp(plan: Plan): Plan | null {
  return higherPlanThan(plan, purchasablePlans());
}
