import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ApiClientError, api } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { AuthShell } from "../components/shell";
import { Alert, Box, Button, Pill, TextField } from "../components/ui";
import { useDograhHealth } from "../hooks/useDograhHealth";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(1, "Enter your password."),
});

const signupSchema = z.object({
  name: z.string().min(2, "Enter your name."),
  email: z.string().email("Enter a valid email."),
  password: z.string().min(8, "Use at least 8 characters."),
});

const magicLinkSchema = z.object({
  email: z.string().email("Enter a valid email."),
});

type LoginValues = z.infer<typeof loginSchema>;
type SignupValues = z.infer<typeof signupSchema>;
type MagicLinkValues = z.infer<typeof magicLinkSchema>;

function intendedRoute(): string {
  const route = new URLSearchParams(window.location.search).get("redirect");
  if (
    !route?.startsWith("/") ||
    route.startsWith("//") ||
    route.includes("\\")
  ) {
    return "/app";
  }

  const resolved = new URL(route, window.location.origin);
  return resolved.origin === window.location.origin
    ? `${resolved.pathname}${resolved.search}${resolved.hash}`
    : "/app";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const landingChannels = [
  {
    title: "Website voice",
    pill: "Live",
    live: true,
    body: "One line of code puts a talk button on your site. Visitors speak — no app, no number to dial.",
  },
  {
    title: "Browser calls",
    pill: "Live",
    live: true,
    body: "Same agent, straight from the page. Barge-in, real answers from your knowledge, escalation when it matters.",
  },
  {
    title: "Real phone number",
    pill: "Soon",
    live: false,
    body: "Port yours or take a new one. Overflow only, or every call — your call.",
  },
  {
    title: "SMS & email",
    pill: "Soon",
    live: false,
    body: "Missed-call text-back that actually books the slot, and enquiries triaged before you open your laptop.",
  },
];

const landingStats = [
  { value: "24/7", label: "answers on your site, day or night" },
  { value: "1 line", label: "of embed code from publish to live" },
  { value: "1 afternoon", label: "from sign-up to live on the site" },
];

export function LandingPage() {
  const auth = useAuth();
  const { isLoading, turnEnabled } = useDograhHealth();
  const isAuthenticated = auth.status === "authenticated";
  const primaryHref = isAuthenticated ? "/app" : "/signup";
  const primaryLabel = isAuthenticated ? "Open app →" : "Start setup →";

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <Link to="/" className="wordmark">
          vocalonix
        </Link>
        <nav className="landing-nav__links">
          {turnEnabled ? (
            <Link to="/demo">Hear it now</Link>
          ) : null}
          {isAuthenticated ? (
            <Link to="/app" className="ui-button ui-button--primary">
              Open app
            </Link>
          ) : (
            <>
              <Link to="/login">Log in</Link>
              <Link to="/signup" className="ui-button ui-button--primary">
                Start setup
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="landing-hero">
        <Pill variant="accent">For appointment businesses</Pill>
        <h1>Never lose another booking to a missed call.</h1>
        <p>
          Vocalonix answers your website out loud, 24/7 — quoting your real
          prices, reading your real knowledge, and passing the caller to you
          when it matters. Configure the agent, publish once, and visitors
          start a browser voice call without a phone provider.
        </p>
        <div className="landing__actions">
          <Link to={primaryHref} className="ui-button ui-button--primary">
            {primaryLabel}
          </Link>
          {!isLoading && turnEnabled ? (
            <Link to="/demo" className="ui-button">
              Hear it now
            </Link>
          ) : null}
        </div>
        <p className="landing-hero__note">
          Live in an afternoon · no phone line to set up · cancel in two clicks
        </p>
      </section>

      <section className="landing-section">
        <p className="eyebrow">One agent, every way people reach you</p>
        <h2>Write your answers once. Every channel uses the same brief.</h2>
        <div className="feature-grid feature-grid--four">
          {landingChannels.map((channel) => (
            <Box key={channel.title} padding="sm">
              <div className="account-section__heading">
                <h3>{channel.title}</h3>
                <Pill variant={channel.live ? "good" : "default"}>{channel.pill}</Pill>
              </div>
              <p>{channel.body}</p>
            </Box>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <p className="eyebrow">7:40pm on a Tuesday</p>
        <h2>The call you&apos;re not there for</h2>
        <div className="landing-compare">
          <Box tone="tinted" padding="md">
            <p className="eyebrow">Today</p>
            <ol>
              <li>Rings out. Voicemail nobody checks until Thursday.</li>
              <li>They google the next place on the list.</li>
              <li>You never learn the enquiry existed.</li>
            </ol>
          </Box>
          <Box padding="md">
            <p className="eyebrow">With Vocalonix</p>
            <ol>
              <li>Answered in two rings, by name, with your prices.</li>
              <li>The caller hears real answers from your knowledge.</li>
              <li>A transcript and anything unanswered is flagged for 8am.</li>
            </ol>
          </Box>
        </div>
      </section>

      <section className="landing-section landing-stats">
        {landingStats.map((stat) => (
          <div key={stat.value}>
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </section>

      <section className="landing-section landing-cta">
        <h2>Put a voice on your website this afternoon.</h2>
        <div className="landing__actions">
          <Link to={primaryHref} className="ui-button ui-button--primary">
            {primaryLabel}
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <span>© 2026 Vocalonix</span>
        {turnEnabled ? <Link to="/demo">Hear it now</Link> : null}
      </footer>
    </div>
  );
}

export function LoginPage() {
  const auth = useAuth();
  const [notice, setNotice] = useState<string | null>(null);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    if (auth.status === "authenticated") {
      window.location.replace(intendedRoute());
    }
  }, [auth.status]);

  return (
    <AuthShell width={420}>
      <AuthHeader />
      <form
        onSubmit={form.handleSubmit(async (values) => {
          setNotice(null);
          try {
            await auth.login(values);
            window.location.replace(intendedRoute());
          } catch (error) {
            setNotice(errorMessage(error, "Unable to sign in."));
          }
        })}
      >
        <Box padding="lg">
          <h1 className="auth-card-title">Welcome back</h1>
          <p className="auth-card-copy">Log in to your desk.</p>
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            error={form.formState.errors.email?.message}
            required
            {...form.register("email")}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            error={form.formState.errors.password?.message}
            required
            {...form.register("password")}
          />
          {notice ? <Alert variant="error">{notice}</Alert> : null}
          <Button
            type="submit"
            variant="primary"
            className="full-width"
            loading={form.formState.isSubmitting}
          >
            Log in →
          </Button>
          <a
            className="auth-secondary-link"
            href={`/magic?redirect=${encodeURIComponent(intendedRoute())}`}
          >
            Email me a sign-in link
          </a>
        </Box>
      </form>
      <p className="auth-switch">
        New here?{" "}
        <a href={`/signup?redirect=${encodeURIComponent(intendedRoute())}`}>
          Create an account
        </a>
      </p>
    </AuthShell>
  );
}

export function SignupPage() {
  const auth = useAuth();

  useEffect(() => {
    if (auth.status === "authenticated") {
      window.location.replace(intendedRoute());
    }
  }, [auth.status]);

  const [notice, setNotice] = useState<{
    message: string;
    previewUrl?: string | null;
    variant: "error" | "success" | "warn";
  } | null>(null);
  const signupParams = new URLSearchParams(window.location.search);
  const demoEmail = signupParams.get("demoEmail") ?? "";
  const demoName = signupParams.get("demoName") ?? "";

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: demoEmail, name: demoName, password: "" },
  });

  return (
    <AuthShell width={460}>
      <AuthHeader tagline="The AI receptionist for your website." />
      <form
        onSubmit={form.handleSubmit(async (values) => {
          setNotice(null);
          try {
            const result = await api.auth.signup({
              ...values,
              returnTo: intendedRoute(),
            });
            if (result.requiresVerification) {
              setNotice({
                message: result.verificationPreviewUrl
                  ? "Email delivery is disabled locally. Use the verification preview."
                  : "Check your inbox to verify your email before signing in.",
                previewUrl: result.verificationPreviewUrl,
                variant: result.verificationPreviewUrl ? "warn" : "success",
              });
              return;
            }
            await auth.refresh();
            window.location.replace(intendedRoute());
          } catch (error) {
            setNotice({
              message: errorMessage(error, "Unable to create the account."),
              variant: "error",
            });
          }
        })}
      >
        <Box padding="lg">
          <h1 className="auth-card-title">Stop missing calls</h1>
          <p className="auth-card-copy">
            Set up your agent in an afternoon. No card needed to start.
          </p>
          <TextField
            label="Full name"
            autoComplete="name"
            error={form.formState.errors.name?.message}
            required
            {...form.register("name")}
          />
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            error={form.formState.errors.email?.message}
            required
            {...form.register("email")}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            helper="At least 8 characters."
            error={form.formState.errors.password?.message}
            required
            {...form.register("password")}
          />
          {notice ? (
            <Alert variant={notice.variant}>
              {notice.message}
              {notice.previewUrl ? (
                <>
                  {" "}
                  <a href={notice.previewUrl}>Verify this local account.</a>
                </>
              ) : null}
            </Alert>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            className="full-width"
            loading={form.formState.isSubmitting}
          >
            Create account →
          </Button>
        </Box>
      </form>
      <p className="auth-switch">
        Already have an account?{" "}
        <a href={`/login?redirect=${encodeURIComponent(intendedRoute())}`}>
          Log in
        </a>
      </p>
    </AuthShell>
  );
}

export function MagicLinkPage() {
  const token = new URLSearchParams(window.location.search).get("token");
  return token ? <MagicLinkCallback token={token} /> : <MagicLinkRequest />;
}

function MagicLinkRequest() {
  const [result, setResult] = useState<{
    message: string;
    previewUrl?: string | null;
    variant: "error" | "success" | "warn";
  } | null>(null);
  const form = useForm<MagicLinkValues>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: { email: "" },
  });

  return (
    <AuthShell width={440}>
      <AuthHeader />
      <form
        onSubmit={form.handleSubmit(async ({ email }) => {
          setResult(null);
          try {
            const response = await api.auth.requestMagicLink(
              email,
              intendedRoute(),
            );
            setResult({
              message: response.previewUrl
                ? "Email delivery is disabled locally. Use the preview link below."
                : "Check your inbox for a sign-in link.",
              previewUrl: response.previewUrl,
              variant: response.previewUrl ? "warn" : "success",
            });
          } catch (error) {
            setResult({
              message: errorMessage(error, "Unable to create a sign-in link."),
              variant: "error",
            });
          }
        })}
      >
        <Box padding="lg">
          <h1 className="auth-card-title">Sign in by email</h1>
          <p className="auth-card-copy">
            We will send a one-time sign-in link. New users should create an
            account first.
          </p>
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            error={form.formState.errors.email?.message}
            required
            {...form.register("email")}
          />
          {result ? (
            <Alert variant={result.variant}>
              {result.message}
              {result.previewUrl ? (
                <>
                  {" "}
                  <a href={result.previewUrl}>Open the local sign-in link.</a>
                </>
              ) : null}
            </Alert>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            className="full-width"
            loading={form.formState.isSubmitting}
          >
            Send sign-in link →
          </Button>
        </Box>
      </form>
      <p className="auth-switch">
        Prefer a password? <Link to="/login">Log in</Link>
      </p>
    </AuthShell>
  );
}

function MagicLinkCallback({ token }: { token: string }) {
  const auth = useAuth();
  const started = useRef(false);
  const [state, setState] = useState<{
    title: string;
    message: string;
    variant: "error" | "success" | "warn";
    success: boolean;
  }>({
    title: "Signing you in",
    message: "Validating this one-time link…",
    variant: "warn",
    success: false,
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void api.auth
      .consumeMagicLink(token)
      .then(async () => {
        await auth.refresh();
        setState({
          title: "Signed in",
          message: "The link was accepted and cannot be used again.",
          variant: "success",
          success: true,
        });
      })
      .catch((error: unknown) => {
        const code = error instanceof ApiClientError ? error.code : null;
        const copy =
          code === "TOKEN_EXPIRED"
            ? {
                title: "Link expired",
                message: "Request a new sign-in link to continue.",
              }
            : code === "TOKEN_ALREADY_USED"
              ? {
                  title: "Link already used",
                  message: "This one-time link has already signed in a session.",
                }
              : {
                  title: "Invalid link",
                  message: "This sign-in link is invalid or no longer available.",
                };
        setState({ ...copy, variant: "error", success: false });
      });
  }, [auth, token]);

  return (
    <AuthShell width={440}>
      <AuthHeader />
      <Box padding="lg">
        <h1 className="auth-card-title">{state.title}</h1>
        <Alert variant={state.variant}>{state.message}</Alert>
        {state.success ? (
          <a
            className="ui-button ui-button--primary full-width"
            href={intendedRoute()}
          >
            Continue to Vocalonix →
          </a>
        ) : (
          <Link className="ui-button full-width" to="/magic">
            Request another link
          </Link>
        )}
      </Box>
    </AuthShell>
  );
}

export function VerifyEmailPage() {
  const auth = useAuth();
  const token = new URLSearchParams(window.location.search).get("token");
  const started = useRef(false);
  const [state, setState] = useState<{
    message: string;
    success: boolean;
  }>({
    message: token
      ? "Validating your email address…"
      : "This verification link is invalid.",
    success: false,
  });

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;

    void api.auth
      .verifyEmail(token)
      .then(async () => {
        await auth.refresh();
        setState({ message: "Your email is verified.", success: true });
      })
      .catch((error: unknown) => {
        setState({
          message: errorMessage(error, "This verification link is invalid."),
          success: false,
        });
      });
  }, [auth, token]);

  return (
    <AuthShell width={440}>
      <AuthHeader />
      <Box padding="lg">
        <h1 className="auth-card-title">
          {state.success ? "Email verified" : "Verify your email"}
        </h1>
        <Alert variant={state.success ? "success" : "warn"}>
          {state.message}
        </Alert>
        <a
          className="ui-button ui-button--primary full-width"
          href={state.success ? intendedRoute() : "/login"}
        >
          {state.success ? "Continue to Vocalonix →" : "Return to login"}
        </a>
      </Box>
    </AuthShell>
  );
}

function AuthHeader({ tagline }: { tagline?: string }) {
  return (
    <div className="auth-header">
      <Link to="/" className="wordmark">
        vocalonix
      </Link>
      {tagline ? <p>{tagline}</p> : null}
    </div>
  );
}
