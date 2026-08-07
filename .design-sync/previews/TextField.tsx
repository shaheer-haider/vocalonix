import { TextField } from "@vocalonix/web";

const stack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  maxWidth: 420,
};

export function Default() {
  return (
    <div style={stack}>
      <TextField label="Agent name" defaultValue="Nova" />
    </div>
  );
}

export function WithHelperAndError() {
  return (
    <div style={stack}>
      <TextField
        label="Business email"
        defaultValue="nova@acme.co"
        helper="We send call summaries here."
      />
      <TextField
        label="Business email"
        defaultValue="nova@acme"
        error="That doesn't look like a valid email address."
      />
    </div>
  );
}

export function MonoAndRequired() {
  return (
    <div style={stack}>
      <TextField
        label="Public API key"
        mono
        defaultValue="vx_live_7f3c9a21b04e"
        helper="Rotate this if it ever leaks."
      />
      <TextField label="Workspace slug" required defaultValue="acme-dental" />
    </div>
  );
}
