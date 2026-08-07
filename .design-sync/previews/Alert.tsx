import { Alert } from "@vocalonix/web";

const stack: React.CSSProperties = {
  display: "grid",
  gap: 12,
  maxWidth: 520,
};

export function Variants() {
  return (
    <div style={stack}>
      <Alert variant="info" title="Heads up">
        Calls are answered by the draft agent until you publish.
      </Alert>
      <Alert variant="success" title="Agent published">
        Acme Dental is now answering on +44 20 7946 0912.
      </Alert>
      <Alert variant="warn" title="Verify your email">
        We sent a link to nova@acme.co. Until then, calls are capped at 10/day.
      </Alert>
      <Alert variant="error" title="Telephony disconnected">
        We couldn't reach your provider. Calls are going to voicemail.
      </Alert>
    </div>
  );
}

export function BodyOnly() {
  return (
    <div style={stack}>
      <Alert>
        Dropdown closes on outside click and supports arrow keys and Escape.
      </Alert>
    </div>
  );
}
