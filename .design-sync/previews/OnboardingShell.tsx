import { Box, Button, OnboardingShell, TextArea, TextField } from "@vocalonix/web";

const steps = [
  { slug: "business", label: "Business details", done: true },
  { slug: "hours", label: "Opening hours", done: true },
  { slug: "greeting", label: "Greeting & tone" },
  { slug: "voice", label: "Pick a voice" },
  { slug: "publish", label: "Publish" },
];

export function MidSetup() {
  return (
    <OnboardingShell
      title="Set up Acme Dental"
      businessSlug="acme-dental"
      currentSlug="greeting"
      steps={steps}
    >
      <Box style={{ padding: 22, display: "grid", gap: 16 }}>
        <h2>Greeting &amp; tone</h2>
        <p>
          This is the first thing a caller hears. Keep it short — the agent will
          introduce the business and then listen.
        </p>
        <TextField label="Business name as spoken" defaultValue="Acme Dental" />
        <TextArea
          label="Greeting"
          defaultValue="Hi, thanks for calling Acme Dental. How can I help today?"
        />
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <Button variant="ghost">Back</Button>
          <Button variant="primary">Continue</Button>
        </div>
      </Box>
    </OnboardingShell>
  );
}

export function FirstStep() {
  return (
    <OnboardingShell
      title="Set up Acme Dental"
      businessSlug="acme-dental"
      currentSlug="business"
      steps={steps.map((step) => ({ ...step, done: false }))}
    >
      <Box style={{ padding: 22, display: "grid", gap: 16 }}>
        <h2>Business details</h2>
        <TextField label="Business name" defaultValue="Acme Dental" />
        <TextField label="Website" defaultValue="acmedental.co.uk" />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button variant="primary">Continue</Button>
        </div>
      </Box>
    </OnboardingShell>
  );
}
