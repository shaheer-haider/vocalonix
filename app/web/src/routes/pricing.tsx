import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";

import { api } from "../api";
import { useAuth } from "../auth/AuthProvider";
import {
  CONTACT_EMAIL,
  MarketingFooter,
  MarketingNav,
} from "../components/shell";
import { Alert, Box, LoadingState, Pill } from "../components/ui";
import { useDograhHealth } from "../hooks/useDograhHealth";
import type { PublicPlan, PublicPricing } from "../types";

/** Whole dollars unless the price genuinely has cents. */
export function money(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/**
 * The plan cards, shared by the public pricing page and the onboarding plan
 * step. Both render the same catalogue from the same endpoint; the only thing
 * that differs is what the button does, which is why the action is a render
 * prop rather than a mode flag.
 */
export function PlanGrid({
  plans,
  currentPlanId,
  action,
}: {
  plans: PublicPlan[];
  currentPlanId?: string;
  action: (plan: PublicPlan) => React.ReactNode;
}) {
  return (
    <div className="pricing-grid">
      {plans.map((plan) => {
        const current = plan.id === currentPlanId;
        return (
          <Box
            key={plan.id}
            padding="md"
            className={`pricing-card${
              plan.highlighted ? " pricing-card--featured" : ""
            }`}
          >
            <div className="pricing-card__head">
              <h3>{plan.name}</h3>
              {current ? (
                <Pill variant="good">Current</Pill>
              ) : plan.highlighted ? (
                <Pill variant="accent">Most popular</Pill>
              ) : null}
            </div>

            {/* "$0" rather than "Free", because the plan is already named
                Free directly above and the pair read as a stutter. */}
            <p className="pricing-card__price">
              <strong>{money(plan.amountCents)}</strong>
              <span>/month</span>
            </p>

            <p className="pricing-card__tagline">{plan.tagline}</p>

            <ul className="pricing-card__features">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>

            <div className="pricing-card__action">{action(plan)}</div>
          </Box>
        );
      })}
    </div>
  );
}

/** One hook, because three surfaces now read the catalogue. */
export function usePricing(): { pricing: PublicPricing | null; error: boolean } {
  const [pricing, setPricing] = useState<PublicPricing | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.billing
      .plans()
      .then((result) => {
        if (!cancelled) setPricing(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { pricing, error };
}

const faqs = [
  {
    q: "What counts as a minute?",
    a: "Time the agent spends actually talking to somebody — on your website or on your phone number. Setting it up, testing it yourself and the dashboard cost nothing.",
  },
  {
    q: "What happens when I run out?",
    a: "We email you when you are at 80%, and again the moment they are gone. The agent then stops answering until the period rolls over or you move up a plan. There is no overage charge — we would rather stop than send you a bill you did not agree to.",
  },
  {
    q: "Do I need a phone number?",
    a: "No. The website widget works on its own, and it is the fastest way to hear the agent on your own site. The free plan answers there only; a number of its own — with warm transfer and outbound callbacks — comes with Essential and Pro, one per business.",
  },
  {
    q: "What if I run more than one business?",
    a: "A plan is bought once and covers several businesses, each with its own agent, its own number and its own team. Pro includes three, and further businesses are $19 a month each.",
  },
  {
    q: "Can I cancel?",
    a: "Any time, from the billing portal, in two clicks. You keep your minutes until the end of the period you have paid for.",
  },
];

export function PricingPage() {
  const auth = useAuth();
  const { pricing, error } = usePricing();
  const { turnEnabled } = useDograhHealth();
  const isAuthenticated = auth.status === "authenticated";

  return (
    <div className="landing-page">
      <MarketingNav />

      <section className="landing-hero">
        <Pill variant="accent">Pricing</Pill>
        <h1>Start free. Pay when it earns its keep.</h1>
        <p>
          Every plan answers on your website and on a real phone number, quotes
          your real prices and books into your real diary. What changes is how
          much talking it does, and how many businesses it does it for.
        </p>
      </section>

      {error ? (
        <Alert variant="error">
          Pricing could not be loaded right now. Please try again shortly.
        </Alert>
      ) : null}

      {!pricing && !error ? <LoadingState label="Loading pricing…" /> : null}

      {pricing ? (
        <>
          <section className="landing-section">
            <PlanGrid
              plans={pricing.plans}
              action={(plan) =>
                plan.amountCents === 0 ? (
                  <Link
                    to={isAuthenticated ? "/app" : "/signup"}
                    className="ui-button"
                  >
                    Start free
                  </Link>
                ) : plan.purchasable ? (
                  <Link
                    to={isAuthenticated ? "/app" : "/signup"}
                    className={`ui-button${
                      plan.highlighted ? " ui-button--primary" : ""
                    }`}
                  >
                    Choose {plan.name}
                  </Link>
                ) : (
                  // "Talk to us" pointed at /signup, which is not talking to
                  // anybody. A plan with no price id cannot be bought online,
                  // so the only honest action is an address that reaches a
                  // person.
                  <a
                    href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
                      `Harkbell ${plan.name}`,
                    )}`}
                    className={`ui-button${
                      plan.highlighted ? " ui-button--primary" : ""
                    }`}
                  >
                    Email us about {plan.name}
                  </a>
                )
              }
            />
            {!pricing.billingEnabled ? (
              <p className="landing-hero__note">
                Card payments are not switched on yet — email{" "}
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we
                will set your workspace up directly.
              </p>
            ) : null}
          </section>

          <section className="landing-section">
            <p className="eyebrow">The honest bits</p>
            <h2>Questions worth answering before you sign up</h2>
            <div className="pricing-faq">
              {faqs.map((faq) => (
                <Box key={faq.q} padding="sm">
                  <h3>{faq.q}</h3>
                  <p>{faq.a}</p>
                </Box>
              ))}
            </div>
          </section>

          {/* The page has to close on something. When the voice engine cannot
              take a call, "Hear it now" is a link to a demo that will not dial,
              so the close becomes the free plan instead of disappearing. */}
          <section className="landing-section landing-cta">
            {turnEnabled ? (
              <>
                <h2>Hear it before you decide.</h2>
                <div className="landing__actions">
                  <Link to="/demo" className="ui-button ui-button--primary">
                    Hear it now →
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h2>Start free, and hear it on your own site.</h2>
                <div className="landing__actions">
                  <Link
                    to={isAuthenticated ? "/app" : "/signup"}
                    className="ui-button ui-button--primary"
                  >
                    {isAuthenticated ? "Open app →" : "Start setup →"}
                  </Link>
                </div>
              </>
            )}
          </section>
        </>
      ) : null}

      <MarketingFooter />
    </div>
  );
}
