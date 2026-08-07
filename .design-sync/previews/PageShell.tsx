import { Box, Button, PageShell, Pill } from "@vocalonix/web";

export function PublicPage() {
  return (
    <PageShell>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Vocalonix</p>
          <h1>Never miss another call</h1>
          <p>
            A voice agent that answers, books and follows up — in your practice's
            own words.
          </p>
        </div>
      </section>
      <Box style={{ padding: 22, display: "grid", gap: 12, maxWidth: 520 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Try it now</h2>
          <Pill variant="accent">Beta</Pill>
        </div>
        <p style={{ margin: 0 }}>Call the demo line and hear a live agent take a booking.</p>
        <div>
          <Button variant="primary">Hear it now</Button>
        </div>
      </Box>
    </PageShell>
  );
}

export function WithoutNav() {
  return (
    <PageShell nav={false}>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Legal</p>
          <h1>Privacy policy</h1>
          <p>Pages that supply their own header pass nav={"{false}"}.</p>
        </div>
      </section>
    </PageShell>
  );
}
