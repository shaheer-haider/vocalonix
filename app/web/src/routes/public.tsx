import { Link } from "@tanstack/react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthShell } from "../components/shell";
import { Alert, Box, Button, Pill, TextField } from "../components/ui";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(8, "Use at least 8 characters."),
});

const signupSchema = loginSchema.extend({
  name: z.string().min(2, "Enter your name."),
});

type LoginValues = z.infer<typeof loginSchema>;
type SignupValues = z.infer<typeof signupSchema>;

export function LandingPage() {
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
          <Link to="/signup" className="ui-button ui-button--primary">
            Start setup →
          </Link>
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
          <Link to="/secret/test-agent">unprotected lab</Link>. Account creation
          becomes functional when authentication lands in the next phase.
        </div>
      </section>
    </AuthShell>
  );
}

export function LoginPage() {
  const [notice, setNotice] = useState<string | null>(null);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  return (
    <AuthShell width={420}>
      <AuthHeader />
      <form
        onSubmit={form.handleSubmit(() => {
          setNotice("Account sessions arrive in the next phase; this form validates the shell only.");
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
          {notice ? <Alert>{notice}</Alert> : null}
          <Button type="submit" variant="primary" className="full-width">
            Log in →
          </Button>
        </Box>
      </form>
      <p className="auth-switch">
        New here? <Link to="/signup">Create an account</Link>
      </p>
    </AuthShell>
  );
}

export function SignupPage() {
  const [notice, setNotice] = useState<string | null>(null);
  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", name: "", password: "" },
  });

  return (
    <AuthShell width={460}>
      <AuthHeader tagline="Your self-hosted AI receptionist." />
      <form
        onSubmit={form.handleSubmit(() => {
          setNotice("Signup is visual-only until the authenticated backend lands in the next phase.");
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
          {notice ? <Alert>{notice}</Alert> : null}
          <Button type="submit" variant="primary" className="full-width">
            Create account →
          </Button>
        </Box>
      </form>
      <p className="auth-switch">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
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
