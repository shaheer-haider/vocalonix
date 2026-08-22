import { createHmac } from "node:crypto";

import { describe, expect, test } from "bun:test";

import { businessAllowance } from "./limits";
import { subscriptionUpdate, verifyStripeSignature } from "./routes";
import {
  FREE_PLAN,
  PHONE_NUMBERS_PER_BUSINESS,
  PLANS,
  UNLIMITED,
  effectivePlan,
  isEntitled,
  planById,
} from "./plans";

const SECRET = "whsec_test_secret";

function sign(
  body: string,
  secret = SECRET,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

describe("verifyStripeSignature", () => {
  const body = JSON.stringify({ id: "evt_1", type: "customer.subscription.updated" });

  test("accepts a correctly signed payload", () => {
    expect(verifyStripeSignature(body, sign(body), SECRET)).toBe(true);
  });

  test("rejects a payload signed with a different secret", () => {
    expect(verifyStripeSignature(body, sign(body, "whsec_wrong"), SECRET)).toBe(
      false,
    );
  });

  test("rejects when the body has been altered after signing", () => {
    const header = sign(body);
    const tampered = body.replace("evt_1", "evt_2");
    expect(verifyStripeSignature(tampered, header, SECRET)).toBe(false);
  });

  test("refuses everything when no secret is configured", () => {
    // Otherwise anyone who can POST to the public URL could grant themselves a plan.
    expect(verifyStripeSignature(body, sign(body), null)).toBe(false);
  });

  test("rejects a missing or malformed header", () => {
    expect(verifyStripeSignature(body, null, SECRET)).toBe(false);
    expect(verifyStripeSignature(body, "garbage", SECRET)).toBe(false);
    expect(verifyStripeSignature(body, "t=123", SECRET)).toBe(false);
  });

  test("rejects a replayed signature outside the tolerance window", () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect(verifyStripeSignature(body, sign(body, SECRET, old), SECRET)).toBe(
      false,
    );
  });

  test("accepts when one of several v1 signatures matches, as during key rotation", () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const good = createHmac("sha256", SECRET)
      .update(`${timestamp}.${body}`)
      .digest("hex");
    const header = `t=${timestamp},v1=${"0".repeat(good.length)},v1=${good}`;
    expect(verifyStripeSignature(body, header, SECRET)).toBe(true);
  });
});

describe("subscriptionUpdate", () => {
  test("maps a Stripe price back to the catalogue plan", () => {
    const priceId = PLANS.pro.priceId ?? "price_pro_placeholder";
    const result = subscriptionUpdate({
      id: "sub_123",
      status: "active",
      current_period_end: 1800000000,
      items: { data: [{ price: { id: priceId } }] },
    });

    // Without a configured price id the catalogue cannot match, and falling back
    // to Free is the safe direction to be wrong in.
    expect(result.planName).toBe(PLANS.pro.priceId ? "pro" : "free");
    expect(result.planStatus).toBe("active");
    expect(result.stripeSubscriptionId).toBe("sub_123");
    expect(result.planPeriodEnd?.getTime()).toBe(1800000000 * 1000);
  });

  test("falls back to Free for an unrecognised price", () => {
    const result = subscriptionUpdate({
      id: "sub_x",
      status: "active",
      items: { data: [{ price: { id: "price_not_ours" } }] },
    });
    expect(result.planName).toBe("free");
    expect(result.planPeriodEnd).toBeNull();
  });

  test("treats a missing status as incomplete rather than active", () => {
    const result = subscriptionUpdate({ id: "sub_y", items: { data: [] } });
    expect(result.planStatus).toBe("incomplete");
  });
});

describe("entitlement", () => {
  test("only active and trialing grant the paid plan", () => {
    expect(isEntitled("active")).toBe(true);
    expect(isEntitled("trialing")).toBe(true);
    expect(isEntitled("past_due")).toBe(false);
    expect(isEntitled("canceled")).toBe(false);
    expect(isEntitled("incomplete")).toBe(false);
    expect(isEntitled(null)).toBe(false);
  });

  test("a lapsed payment drops the workspace to Free even while planName says pro", () => {
    expect(
      effectivePlan({ planName: "pro", planStatus: "past_due" }).id,
    ).toBe("free");
  });

  test("an active subscription keeps its plan", () => {
    expect(effectivePlan({ planName: "pro", planStatus: "active" }).id).toBe(
      "pro",
    );
  });

  test("an unknown plan id resolves to Free rather than throwing", () => {
    expect(planById("enterprise-unicorn").id).toBe(FREE_PLAN.id);
    expect(planById(null).id).toBe(FREE_PLAN.id);
  });

  test("Free is more restrictive than every paid plan", () => {
    expect(FREE_PLAN.monthlyMinutes).toBeLessThan(PLANS.starter.monthlyMinutes);
    expect(PLANS.starter.monthlyMinutes).toBeLessThan(PLANS.pro.monthlyMinutes);
    expect(PLANS.pro.seats).toBe(UNLIMITED);
  });
});

describe("the catalogue matches what the pricing page promises", () => {
  test("seats climb 2 → 10 → unlimited", () => {
    expect(PLANS.free.seats).toBe(2);
    expect(PLANS.starter.seats).toBe(10);
    expect(PLANS.pro.seats).toBe(UNLIMITED);
  });

  test("businesses climb 1 → 1 → 3", () => {
    expect(PLANS.free.businesses).toBe(1);
    expect(PLANS.starter.businesses).toBe(1);
    expect(PLANS.pro.businesses).toBe(3);
  });

  test("only Pro sells extra businesses, at $19", () => {
    expect(PLANS.free.additionalBusinessCents).toBeNull();
    expect(PLANS.starter.additionalBusinessCents).toBeNull();
    expect(PLANS.pro.additionalBusinessCents).toBe(1900);
  });

  test("a business that may hold a number holds exactly one", () => {
    // How many is a product rule and the same everywhere; whether is the plan
    // lever below. More numbers means more businesses.
    expect(PHONE_NUMBERS_PER_BUSINESS).toBe(1);
  });

  test("only paid plans may claim a phone number", () => {
    // A number is a recurring carrier charge. Free answering on the website
    // costs us nothing per signup; a free number does not.
    expect(PLANS.free.phoneNumber).toBe(false);
    expect(PLANS.starter.phoneNumber).toBe(true);
    expect(PLANS.pro.phoneNumber).toBe(true);
  });

  test("no plan advertises a phone number it cannot claim", () => {
    // The bug this replaces: Essential sold "Warm transfer to a person" and Pro
    // sold "Outbound callbacks from your own number" while both worked on Free,
    // because nothing was gated at all. Both need a live number, so the number
    // gate is what makes the copy true — and this is the assertion that keeps
    // the two from drifting apart again.
    for (const plan of Object.values(PLANS)) {
      const mentionsNumber = plan.features.some((feature) =>
        /phone number|outbound|transfer/i.test(feature),
      );
      if (mentionsNumber) expect(plan.phoneNumber).toBe(true);
    }
  });

  test("every paid plan opens by carrying the tier below it", () => {
    // The cards read as a ladder rather than three unrelated lists, and a
    // reader should not have to diff them to see what upgrading buys.
    expect(PLANS.starter.features[0]).toBe("Everything in Free");
    expect(PLANS.pro.features[0]).toBe(`Everything in ${PLANS.starter.name}`);
  });

  test("the stored plan id is not the display name", () => {
    // `starter` reaches Stripe as product `harkbell_starter` and is the value
    // in `plan_name`; renaming the plan for customers must not move it.
    expect(PLANS.starter.id).toBe("starter");
    expect(PLANS.starter.name).toBe("Essential");
  });
});

describe("businessAllowance", () => {
  const account = (over: Partial<Parameters<typeof businessAllowance>[0]> = {}) =>
    businessAllowance({
      planName: "pro",
      planStatus: "active",
      extraBusinesses: 0,
      ...over,
    } as Parameters<typeof businessAllowance>[0]);

  test("is the plan's included count when nothing extra is bought", () => {
    expect(account()).toBe(3);
  });

  test("adds what the account has paid for on top", () => {
    expect(account({ extraBusinesses: 2 })).toBe(5);
  });

  test("a lapsed payment falls back to Free's single business", () => {
    // Extras are priced per plan, so they cannot survive the drop to Free
    // either — otherwise a cancelled Pro keeps five businesses for nothing.
    expect(account({ planStatus: "past_due", extraBusinesses: 2 })).toBe(1);
  });

  test("Free and Essential are one business each", () => {
    expect(account({ planName: "free", planStatus: null })).toBe(1);
    expect(account({ planName: "starter", planStatus: "active" })).toBe(1);
  });
});
