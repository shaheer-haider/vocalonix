import { Link } from "@tanstack/react-router";

export function TopNav() {
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
        <Link to="/login">Log in</Link>
        <Link to="/signup" className="ui-button ui-button--primary">
          Create account
        </Link>
      </div>
    </header>
  );
}

export const PublicNav = TopNav;
