import { Link } from "@tanstack/react-router";

import { useAuth } from "../../auth/AuthProvider";
import { useDograhHealth } from "../../hooks/useDograhHealth";

export function TopNav() {
  const auth = useAuth();
  const { turnEnabled } = useDograhHealth();
  const isAuthenticated = auth.status === "authenticated";

  return (
    <header className="public-nav">
      <Link to="/" className="wordmark" aria-label="Harkbell home">
        harkbell
      </Link>
      <nav aria-label="Public navigation">
        <a href="/#how-it-works">How it works</a>
        <a href="/#widget">Widget</a>
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
              Create account
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

export const PublicNav = TopNav;
