import { Link } from "@tanstack/react-router";

import { useAuth } from "../../auth/AuthProvider";
import { useDograhHealth } from "../../hooks/useDograhHealth";

/**
 * The nav for `PageShell`, which today means the design system page.
 *
 * The marketing pages use `MarketingNav` instead — different chrome, different
 * styling. Keep the labels in step with it: two navs offering the same product
 * under two different button labels is how this drifted the first time.
 */
export function TopNav() {
  const auth = useAuth();
  const { turnEnabled } = useDograhHealth();
  const isAuthenticated = auth.status === "authenticated";

  return (
    <header className="public-nav">
      <Link to="/" className="wordmark" aria-label="Harkbell home">
        harkbell
      </Link>
      {/* These were anchors to `/#how-it-works` and `/#widget`, and neither
          section has ever existed on the landing page — both scrolled nowhere. */}
      <nav aria-label="Public navigation">
        <Link to="/pricing">Pricing</Link>
      </nav>
      {/* The demo is the conversion path, so it stays visible at every width —
          the section links collapse below 980px, this does not. */}
      <div className="public-nav__actions">
        {turnEnabled ? (
          <Link to="/demo" className="public-nav__demo">
            Hear it now
          </Link>
        ) : null}
        {isAuthenticated ? (
          <Link to="/app" className="ui-button ui-button--primary">
            Open app
          </Link>
        ) : (
          <>
            <Link to="/login" className="public-nav__login">
              Log in
            </Link>
            <Link to="/signup" className="ui-button ui-button--primary">
              Start setup
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

export const PublicNav = TopNav;
