import { Link } from "@tanstack/react-router";

import { useAuth } from "../../auth/AuthProvider";
import { useDograhHealth } from "../../hooks/useDograhHealth";

/**
 * The address a customer can actually reach a person on.
 *
 * Deliberately the same mailbox `EMAIL_FROM` sends from: a reply to any Harkbell
 * mail has to land somewhere a human reads, and a second address is a second
 * inbox to forget about. Two CTAs used to promise this — "Talk to us" on an
 * unpurchasable plan and "get in touch" when billing is off — while the site
 * carried no address at all and the button went to /signup.
 */
export const CONTACT_EMAIL = "hello@harkbell.com";

/**
 * One nav and one footer for every public page.
 *
 * They were copied per page, and the copies drifted: the pricing page offered
 * "Hear it now" without checking whether the voice engine could take a call, so
 * a TURN outage left its primary call to action pointing at a demo that could
 * not dial. The guard belongs in one place.
 */
export function MarketingNav() {
  const auth = useAuth();
  const { turnEnabled } = useDograhHealth();
  const isAuthenticated = auth.status === "authenticated";

  return (
    <header className="landing-nav">
      <Link to="/" className="wordmark">
        harkbell
      </Link>
      <nav className="landing-nav__links">
        {turnEnabled ? <Link to="/demo">Hear it now</Link> : null}
        <Link to="/pricing">Pricing</Link>
        {isAuthenticated ? (
          <Link to="/app" className="ui-button ui-button--primary">
            Open app
          </Link>
        ) : (
          <>
            <Link to="/login">Log in</Link>
            {/* "Start setup" everywhere. The same button read "Start setup",
                "Create account" and "Create my agent" on three pages of one
                funnel, which reads as three different offers. */}
            <Link to="/signup" className="ui-button ui-button--primary">
              Start setup
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

export function MarketingFooter() {
  const { turnEnabled } = useDograhHealth();

  return (
    <footer className="landing-footer">
      <span>© 2026 Harkbell</span>
      <Link to="/pricing">Pricing</Link>
      {turnEnabled ? <Link to="/demo">Hear it now</Link> : null}
      <Link to="/terms">Terms</Link>
      <Link to="/privacy">Privacy</Link>
      <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
    </footer>
  );
}
