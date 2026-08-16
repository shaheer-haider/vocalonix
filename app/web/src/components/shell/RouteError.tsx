import { Link } from "@tanstack/react-router";

import { Button } from "../ui/Button";

interface RouteErrorProps {
  /** Router passes the thrown error; we never show it to the visitor. */
  error?: unknown;
  reset?: () => void;
}

/**
 * The product had no error boundary at all, so any thrown render error surfaced
 * as a raw stack trace on public pages. This keeps the visitor inside the brand,
 * says what happened in their language, and always offers a way onward.
 */
export function RouteError({ error, reset }: RouteErrorProps) {
  if (import.meta.env.DEV && error) {
    console.error("Route error:", error);
  }

  return (
    <main className="route-error">
      <div className="route-error__card">
        <a className="wordmark" href="/">
          harkbell
        </a>
        <h1>This page didn&apos;t load</h1>
        <p>
          Something on our side stopped working. Nothing you did caused it, and
          nothing you&apos;ve saved is affected.
        </p>
        <div className="route-error__actions">
          <Button
            variant="primary"
            onClick={() => {
              if (reset) reset();
              else window.location.reload();
            }}
          >
            Try again
          </Button>
          <Link to="/" className="ui-button">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}

/** Shown when a URL doesn't match any route. */
export function RouteNotFound() {
  return (
    <main className="route-error">
      <div className="route-error__card">
        <a className="wordmark" href="/">
          harkbell
        </a>
        <h1>We couldn&apos;t find that page</h1>
        <p>The link may be out of date, or the address may have a typo in it.</p>
        <div className="route-error__actions">
          <Link to="/" className="ui-button ui-button--primary">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
