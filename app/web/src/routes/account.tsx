import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { api, type AccountSession, type BusinessSummary } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { AuthShell } from "../components/shell";
import { Alert, Box, Button, LoadingState, Pill } from "../components/ui";

function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AppHomePage() {
  const auth = useAuth();
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingBusinesses, setLoadingBusinesses] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void api.businesses
      .list()
      .then((items) => {
        if (!cancelled) setBusinesses(items);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load workspaces.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingBusinesses(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (auth.status === "loading") {
    return <LoadingState label="Restoring your account…" />;
  }

  return (
    <AuthShell width={620}>
      <div className="auth-header">
        <Link to="/" className="wordmark">
          vocalonix
        </Link>
      </div>
      <Box style={{ padding: 24 }}>
        <Pill variant="good">Authenticated session</Pill>
        <h1 className="account-title">
          Welcome{auth.session?.user.name ? `, ${auth.session.user.name}` : ""}
        </h1>
        <p className="auth-card-copy">
          Your account is ready. Create or open a business workspace to manage
          members and invitations.
        </p>
        {error ? <Alert variant="error">{error}</Alert> : null}
        {loadingBusinesses ? (
          <LoadingState label="Loading workspaces…" />
        ) : businesses.length > 0 ? (
          <div className="session-list">
            {businesses.map((business) => (
              <a
                className="session-item"
                href={`/app/${business.slug}/dashboard`}
                key={business.id}
              >
                <div>
                  <strong>{business.name}</strong>
                  <span>{business.role}</span>
                </div>
                <Pill>{business.initial}</Pill>
              </a>
            ))}
          </div>
        ) : (
          <Alert variant="warn">
            No business workspaces yet. Create the first one to continue.
          </Alert>
        )}
        <div className="stack-row">
          <Link className="ui-button ui-button--primary" to="/app/onboarding/create">
            Create workspace
          </Link>
          <Link className="ui-button" to="/account">
            Account settings
          </Link>
          <Link className="ui-button" to="/secret/test-agent">
            Open MVP lab
          </Link>
        </div>
      </Box>
    </AuthShell>
  );
}

export function AccountPage() {
  const auth = useAuth();
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"logout" | "logout-all" | null>(null);

  useEffect(() => {
    let cancelled = false;

    void api.auth
      .sessions()
      .then((activeSessions) => {
        if (!cancelled) setSessions(activeSessions);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : "Unable to load sessions.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut(everywhere: boolean) {
    setError(null);
    setWorking(everywhere ? "logout-all" : "logout");
    try {
      if (everywhere) {
        await auth.logoutAll();
      } else {
        await auth.logout();
      }
      window.location.replace("/login");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to sign out.",
      );
      setWorking(null);
    }
  }

  return (
    <AuthShell width={680}>
      <div className="auth-header">
        <Link to="/" className="wordmark">
          vocalonix
        </Link>
      </div>
      <Box style={{ padding: 24 }}>
        <div className="account-heading">
          <div>
            <p className="eyebrow">Account</p>
            <h1 className="account-title">{auth.session?.user.name}</h1>
            <p className="auth-card-copy">{auth.session?.user.email}</p>
          </div>
          <Link className="ui-button" to="/app">
            Back to app
          </Link>
        </div>

        {error ? <Alert variant="error">{error}</Alert> : null}

        <section className="account-section">
          <div className="account-section__heading">
            <div>
              <h2>Active sessions</h2>
              <p>Sessions are stored server-side and backed by HTTP-only cookies.</p>
            </div>
            <Pill>{sessions.length}</Pill>
          </div>
          {loading ? (
            <LoadingState label="Loading sessions…" />
          ) : (
            <div className="session-list">
              {sessions.map((session) => (
                <div className="session-item" key={session.id}>
                  <div>
                    <strong>
                      {session.current ? "This browser" : "Another session"}
                    </strong>
                    <span>{session.userAgent || "Unknown browser"}</span>
                  </div>
                  <time dateTime={new Date(session.updatedAt).toISOString()}>
                    {formatDate(session.updatedAt)}
                  </time>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="stack-row">
          <Button
            variant="ghost"
            loading={working === "logout"}
            onClick={() => void signOut(false)}
          >
            Log out
          </Button>
          <Button
            variant="destructive"
            loading={working === "logout-all"}
            onClick={() => void signOut(true)}
          >
            Log out everywhere
          </Button>
        </div>
      </Box>
    </AuthShell>
  );
}

export function SecurityPage() {
  return <AccountPage />;
}
