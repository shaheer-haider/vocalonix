import { createHmac, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { db } from "../db/client";
import { businesses } from "../db/schema";
import { env } from "../env";
import { ApiError } from "../errors";
import { requirePermission, requireWorkspace } from "../workspace/context";
import {
  FREE_PLAN,
  PLANS,
  UNLIMITED,
  effectivePlan,
  planByPriceId,
  planById,
  purchasablePlans,
  type PlanStatus,
} from "./plans";
import { reconcileBusinessUsage, usageForBusiness } from "./usage";

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

function planShape(plan: ReturnType<typeof planById>) {
  return {
    id: plan.id,
    name: plan.name,
    amountCents: plan.amountCents,
    monthlyMinutes: plan.monthlyMinutes === UNLIMITED ? null : plan.monthlyMinutes,
    phoneNumbers: plan.phoneNumbers === UNLIMITED ? null : plan.phoneNumbers,
    seats: plan.seats === UNLIMITED ? null : plan.seats,
    tagline: plan.tagline,
    features: plan.features,
    highlighted: plan.highlighted ?? false,
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
  /**
   * The catalogue, for the public pricing page. Unauthenticated on purpose —
   * a visitor deciding whether to sign up is exactly who needs it.
   *
   * Free is included even though it cannot be bought, because it is the plan a
   * new workspace lands on and hiding it would misrepresent what signing up
   * gets you. `purchasable` says whether this deployment has a Stripe price
   * configured, so a deployment with billing switched off renders an honest
   * page rather than a checkout button that 409s.
   */
  .get("/api/plans", () => {
    return {
      billingEnabled: Boolean(env.stripeSecretKey),
      plans: Object.values(PLANS).map((plan) => ({
        ...planShape(plan),
        purchasable: plan.priceId !== null,
      })),
    };
  })
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
      // The agent stops answering when the included minutes run out, so the
      // panel has to say so plainly rather than showing a bar quietly at 100%.
      callsSuspendedAt: business.callsSuspendedAt?.toISOString() ?? null,
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
      // Where Stripe sends the browser back to. This is a closed set built on
      // the server rather than a caller-supplied URL, because a `returnTo` that
      // reached `success_url` unchecked would be an open redirect wearing a
      // checkout as a disguise.
      const returnPath =
        body.returnTo === "onboarding"
          ? `/app/${workspace.business.slug}/onboarding/plan`
          : `/app/${workspace.business.slug}/account`;
      const returnUrl = new URL(returnPath, env.appOrigin).toString();

      const session = await stripeRequest("/checkout/sessions", {
        mode: "subscription",
        customer: customerId,
        "line_items[0][price]": plan.priceId,
        "line_items[0][quantity]": "1",
        // Stripe replaces the placeholder; it must reach the browser literally.
        success_url: `${returnUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${returnUrl}?checkout=cancelled`,
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
    {
      body: t.Object({
        planId: t.String(),
        returnTo: t.Optional(
          t.Union([t.Literal("account"), t.Literal("onboarding")]),
        ),
      }),
    },
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

      const affected = await db
        .update(businesses)
        .set({ ...update, updatedAt: new Date() })
        .where(eq(businesses.stripeCustomerId, customerId))
        .returning({ id: businesses.id });

      // An upgrade has to put the agent back on the air now, not on the
      // worker's next sweep — the customer has just paid and will reload the
      // page to check. The same call suspends a workspace whose downgrade left
      // it over its new, smaller allowance.
      for (const row of affected) {
        try {
          await reconcileBusinessUsage(row.id);
        } catch (caught) {
          console.error(
            `Usage reconciliation after a plan change failed for ${row.id}:`,
            caught,
          );
        }
      }
    }

    return { received: true };
  });
