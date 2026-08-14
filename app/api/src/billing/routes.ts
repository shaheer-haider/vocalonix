import { eq } from "drizzle-orm";
import { Elysia } from "elysia";

import { db } from "../db/client";
import { businesses } from "../db/schema";
import { env } from "../env";
import { ApiError } from "../errors";
import { requirePermission, requireWorkspace } from "../workspace/context";

const stripeApiUrl = "https://api.stripe.com/v1";

async function stripeRequest(
  path: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  if (!env.stripeSecretKey) {
    throw new ApiError(
      409,
      "BILLING_NOT_CONFIGURED",
      "Billing is not enabled for this deployment yet.",
    );
  }
  const response = await fetch(`${stripeApiUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
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

export const billingRoutes = new Elysia()
  .get("/api/b/:slug/billing", async ({ params, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    requirePermission(workspace.role, "billing.access");
    return {
      configured: Boolean(env.stripeSecretKey),
      plan: workspace.business.planName ?? "Free",
    };
  })
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
  });
