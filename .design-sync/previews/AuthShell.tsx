import { Alert, AuthShell, Button, TextField } from "@vocalonix/web";

export function LogIn() {
  return (
    <AuthShell>
      <p className="eyebrow">Welcome back</p>
      <h1>Log in</h1>
      <TextField label="Email" defaultValue="nova@acme.co" />
      <TextField label="Password" type="password" defaultValue="hunter22" />
      <Button variant="primary" type="submit">
        Continue
      </Button>
      <p>
        No account yet? <a href="/signup">Create one</a>.
      </p>
    </AuthShell>
  );
}

export function VerifyEmail() {
  return (
    <AuthShell width={420}>
      <p className="eyebrow">One more step</p>
      <h1>Check your inbox</h1>
      <Alert variant="info" title="We sent a link to nova@acme.co">
        The link expires in 15 minutes.
      </Alert>
      <Button>Resend the link</Button>
    </AuthShell>
  );
}
