import { createHmac, timingSafeEqual } from "node:crypto";

import { and, eq, gte, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { db } from "../db/client";
import { businesses, callRecords, memberships } from "../db/schema";
import { env } from "../env";
import { ApiError } from "../errors";
import { requirePermission, requireWorkspace } from "../workspace/context";
import {
  FREE_PLAN,
  UNLIMITED,
  effectivePlan,
  planByPriceId,
  planById,
  purchasablePlans,
  type PlanStatus,
} from "./plans";

const stripeApiUrl = "https://api.stripe.com/v1";

/** Stripe rejects a signature older than this, and so do we. */
const WEBHOOK_TOLERANCE_SECONDS = 300;

async function stripeRequest(
  path: string,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  if (!env.stripeSecretKey) {
    throw new ApiError(
      409,
      "BILLING_NOT_CONFIGURED",
      "Billing is not enabled for this deployment yet.",
    );
  }
  const response = await fetch(`${stripeApiUrl}${path}`, {
    method: params ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${env.stripeSecretKey}`,
      ...(params
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    ...(params ? { body: new URLSearchParams(params).toString() } : {}),
  });
  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!response.ok || !payload) {
    throw new ApiError(
      502,
      "BILLING_PROVIDER_ERROR",
      "The billing provider could not complete the request. Try again shortly.",
    );
  }
  return payload;
}

async function ensureStripeCustomer(business: {
  id: string;
  name: string;
  contactEmail: string | null;
  stripeCustomerId: string | null;
}): Promise<string> {
  if (business.stripeCustomerId) return business.stripeCustomerId;

  const customer = await stripeRequest("/customers", {
    name: business.name,
    ...(business.contactEmail ? { email: business.contactEmail } : {}),
    "metadata[vocalonix_business_id]": business.id,
  });
  const customerId = typeof customer.id === "string" ? customer.id : null;
  if (!customerId) {
    throw new ApiError(
      502,
      "BILLING_PROVIDER_ERROR",
      "The billing provider returned an unexpected response.",
    );
  }
  await db
    .update(businesses)
    .set({ stripeCustomerId: customerId, updatedAt: new Date() })
    .where(eq(businesses.id, business.id));
  return customerId;
}

/**
 * Start of the window usage is measured against. When a subscription is live
 * this is the current period start, which we derive from the period end Stripe
 * reported. Otherwise it is a rolling 30 days, so a workspace on Free still
 * sees a number that means something.
 */
function usageWindowStart(periodEnd: Date | null): Date {
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

/**
 * Whether a workspace may still take calls. Enforced at the point calls are
 * answered rather than at the dashboard, because the dashboard is not the thing
 * that costs money.
 */
export async function callMinutesExhausted(business: {
  id: string;
  planName: string | null;
  planStatus: string | null;
  planPeriodEnd: Date | null;
}): Promise<boolean> {
  const plan = effectivePlan(business);
  if (plan.monthlyMinutes === UNLIMITED) return false;
  const { minutesUsed } = await usageForBusiness(
    business.id,
    business.planPeriodEnd,
  );
  return minutesUsed >= plan.monthlyMinutes;
}

function planShape(plan: ReturnType<typeof planById>) {
  return {
    id: plan.id,
    name: plan.name,
    amountCents: plan.amountCents,
    monthlyMinutes: plan.monthlyMinutes === UNLIMITED ? null : plan.monthlyMinutes,
    phoneNumbers: plan.phoneNumbers === UNLIMITED ? null : plan.phoneNumbers,
    seats: plan.seats === UNLIMITED ? null : plan.seats,
  };
}

/**
 * Verifies Stripe's `stripe-signature` header against the raw body.
 *
 * This has to run on the exact bytes Stripe signed, so the handler reads the
 * body as text and parses it itself — letting the framework parse JSON first
 * would re-serialise it and change the signature. Without a configured secret
 * the endpoint refuses everything, since an unverified webhook would let anyone
 * who can reach the URL grant themselves a paid plan.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || !header) return false;

  const parts = header.split(",").reduce<Record<string, string[]>>(
    (acc, piece) => {
      const [key, value] = piece.split("=", 2);
      if (!key || !value) return acc;
      (acc[key.trim()] ??= []).push(value.trim());
      return acc;
    },
    {},
  );

  const timestamp = parts.t?.[0];
  const signatures = parts.v1 ?? [];
  if (!timestamp || signatures.length === 0) return false;

  const age = Math.abs(nowSeconds - Number(timestamp));
  if (!Number.isFinite(age) || age > WEBHOOK_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const encoder = new TextEncoder();
  const expectedBytes = encoder.encode(expected);

  // Compare against every v1 signature so key rotation, which makes Stripe send
  // two, does not reject valid deliveries.
  return signatures.some((candidate) => {
    const candidateBytes = encoder.encode(candidate);
    if (candidateBytes.length !== expectedBytes.length) return false;
    return timingSafeEqual(candidateBytes, expectedBytes);
  });
}

/** Pulls the fields we store out of a Stripe subscription object. */
export function subscriptionUpdate(subscription: Record<string, unknown>): {
  planName: string;
  planStatus: PlanStatus;
  stripeSubscriptionId: string | null;
  planPeriodEnd: Date | null;
} {
  const items = subscription.items as { data?: unknown[] } | undefined;
  const first = items?.data?.[0] as
    | { price?: { id?: string } }
    | undefined;
  const plan = planByPriceId(first?.price?.id ?? null) ?? FREE_PLAN;
  const periodEndRaw = subscription.current_period_end;
  const status = subscription.status;

  return {
    planName: plan.id,
    planStatus: (typeof status === "string" ? status : "incomplete") as PlanStatus,
    stripeSubscriptionId:
      typeof subscription.id === "string" ? subscription.id : null,
    planPeriodEnd:
      typeof periodEndRaw === "number"
        ? new Date(periodEndRaw * 1000)
        : null,
  };
}

export const billingRoutes = new Elysia()
  .get("/api/b/:slug/billing", async ({ params, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    requirePermission(workspace.role, "billing.access");

    const business = workspace.business;
    const plan = effectivePlan(business);
    const usage = await usageForBusiness(business.id, business.planPeriodEnd);

    return {
      configured: Boolean(env.stripeSecretKey),
      plan: planShape(plan),
      status: business.planStatus ?? null,
      periodEnd: business.planPeriodEnd?.toISOString() ?? null,
      usage: {
        minutesUsed: usage.minutesUsed,
        seatsUsed: usage.seatsUsed,
        windowStart: usage.windowStart.toISOString(),
      },
      available: purchasablePlans().map(planShape),
    };
  })
  .post(
    "/api/b/:slug/billing/checkout",
    async ({ body, params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      requirePermission(workspace.role, "billing.access");

      const plan = planById(body.planId);
      if (!plan.priceId) {
        throw new ApiError(
          400,
          "PLAN_NOT_PURCHASABLE",
          "That plan cannot be bought on this deployment.",
        );
      }

      const customerId = await ensureStripeCustomer(workspace.business);
      const accountUrl = new URL(
        `/app/${workspace.business.slug}/account`,
        env.appOrigin,
      ).toString();

      const session = await stripeRequest("/checkout/sessions", {
        mode: "subscription",
        customer: customerId,
        "line_items[0][price]": plan.priceId,
        "line_items[0][quantity]": "1",
        // Stripe replaces the placeholder; it must reach the browser literally.
        success_url: `${accountUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${accountUrl}?checkout=cancelled`,
        "subscription_data[metadata][vocalonix_business_id]":
          workspace.business.id,
        client_reference_id: workspace.business.id,
        allow_promotion_codes: "true",
      });

      const url = typeof session.url === "string" ? session.url : null;
      if (!url) {
        throw new ApiError(
          502,
          "BILLING_PROVIDER_ERROR",
          "The billing provider returned an unexpected response.",
        );
      }
      return { url };
    },
    { body: t.Object({ planId: t.String() }) },
  )
  .post("/api/b/:slug/billing/portal", async ({ params, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    requirePermission(workspace.role, "billing.access");

    const customerId = await ensureStripeCustomer(workspace.business);
    const session = await stripeRequest("/billing_portal/sessions", {
      customer: customerId,
      return_url: new URL(
        `/app/${workspace.business.slug}/account`,
        env.appOrigin,
      ).toString(),
    });
    const url = typeof session.url === "string" ? session.url : null;
    if (!url) {
      throw new ApiError(
        502,
        "BILLING_PROVIDER_ERROR",
        "The billing provider returned an unexpected response.",
      );
    }
    return { url };
  })
  .post("/api/billing/webhook", async ({ request, set }) => {
    const rawBody = await request.text();
    if (
      !verifyStripeSignature(
        rawBody,
        request.headers.get("stripe-signature"),
        env.stripeWebhookSecret,
      )
    ) {
      set.status = 400;
      return { error: "Invalid signature." };
    }

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      set.status = 400;
      return { error: "Malformed payload." };
    }

    const type = typeof event.type === "string" ? event.type : "";
    const object = (event.data as { object?: Record<string, unknown> })?.object;
    if (!object) return { received: true };

    if (
      type === "customer.subscription.created" ||
      type === "customer.subscription.updated" ||
      type === "customer.subscription.deleted"
    ) {
      const customerId =
        typeof object.customer === "string" ? object.customer : null;
      if (!customerId) return { received: true };

      // A deleted subscription drops the workspace to Free rather than leaving
      // it on a plan it is no longer paying for.
      const update =
        type === "customer.subscription.deleted"
          ? {
              planName: FREE_PLAN.id,
              planStatus: "canceled" as PlanStatus,
              stripeSubscriptionId: null,
              planPeriodEnd: null,
            }
          : subscriptionUpdate(object);

      await db
        .update(businesses)
        .set({ ...update, updatedAt: new Date() })
        .where(eq(businesses.stripeCustomerId, customerId));
    }

    return { received: true };
  });
