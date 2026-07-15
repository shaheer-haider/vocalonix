import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ApiClientError, api } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { AuthShell } from "../components/shell";
import { Alert, Box, Button, Pill, TextField } from "../components/ui";

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

export function LandingPage() {
  const auth = useAuth();
  const isAuthenticated = auth.status === "authenticated";

  return (
    <AuthShell width={760}>
      <section className="landing">
        <Link to="/" className="landing__wordmark">
          vocalonix
        </Link>
        <p className="landing__tagline">Your self-hosted AI receptionist.</p>
        <Pill variant="accent">Self-hosted Dograh voice agents</Pill>
        <h1>AI receptionists that answer from your website.</h1>
        <p>
          Vocalonix turns Dograh into a business control plane: configure the
          agent, upload knowledge, publish a widget, then let visitors start a
          browser-based voice call without a phone provider.
        </p>
        <div className="landing__actions">
          {isAuthenticated ? (
            <Link to="/app" className="ui-button ui-button--primary">
              Open app →
            </Link>
          ) : (
            <Link to="/signup" className="ui-button ui-button--primary">
              Start setup →
            </Link>
          )}
          <Link to="/secret/test-agent" className="ui-button">
            MVP lab
          </Link>
        </div>

        <div className="feature-grid">
          {[
            {
              title: "Configure once",
              body: "Set the greeting, context, widget colors, and conversation guardrails.",
            },
            {
              title: "Publish to Dograh",
              body: "Management credentials remain server-side while the workflow is synchronized.",
            },
            {
              title: "Embed anywhere",
              body: "Paste one public script and let website visitors start a browser call.",
            },
          ].map((feature) => (
            <Box key={feature.title} style={{ padding: 14 }}>
              <h2>{feature.title}</h2>
              <p>{feature.body}</p>
            </Box>
          ))}
        </div>

        <div className="landing__note">
          <strong>Widget-first MVP:</strong> browser calls work in the{" "}
          <Link to="/secret/test-agent">unprotected lab</Link>. Accounts and
          cookie-backed sessions now support real multi-business workspaces,
          roles, and invitations.
        </div>
      </section>
    </AuthShell>
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
        <Box style={{ padding: 22 }}>
          <h1 className="auth-card-title">Welcome back</h1>
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
  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", name: "", password: "" },
  });

  return (
    <AuthShell width={460}>
      <AuthHeader tagline="Your self-hosted AI receptionist." />
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
        <Box style={{ padding: 22 }}>
          <h1 className="auth-card-title">Create your account</h1>
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
        <Box style={{ padding: 22 }}>
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
      <Box style={{ padding: 22 }}>
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
      <Box style={{ padding: 22 }}>
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
