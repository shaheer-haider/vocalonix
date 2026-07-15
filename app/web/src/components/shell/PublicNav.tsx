import { Link } from "@tanstack/react-router";

import { useAuth } from "../../auth/AuthProvider";

export function TopNav() {
  const auth = useAuth();
  const isAuthenticated = auth.status === "authenticated";

  return (
    <header className="public-nav">
      <Link to="/" className="wordmark" aria-label="Vocalonix home">
        vocalonix
      </Link>
      <nav aria-label="Public navigation">
        <a href="/#how-it-works">How it works</a>
        <a href="/#widget">Widget</a>
        <Link to="/secret/test-agent">MVP lab</Link>
      </nav>
      <div className="public-nav__actions">
        {isAuthenticated ? (
          <Link to="/app" className="ui-button ui-button--primary">
            Open app
          </Link>
        ) : (
          <>
            <Link to="/login">Log in</Link>
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
