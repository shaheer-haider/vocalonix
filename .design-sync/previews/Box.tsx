import { Box, Button, Pill } from "@vocalonix/web";

export function Tones() {
  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
      <Box style={{ padding: 18 }}>
        <strong>Default</strong>
        <p>Paper surface — the everyday panel.</p>
      </Box>
      <Box tone="tinted" style={{ padding: 18 }}>
        <strong>Tinted</strong>
        <p>One step back from the page for secondary panels.</p>
      </Box>
      <Box tone="accent" style={{ padding: 18 }}>
        <strong>Accent</strong>
        <p>Soft brand wash for callouts you want noticed.</p>
      </Box>
    </div>
  );
}

export function AsAPanel() {
  return (
    <Box style={{ padding: 22, display: "grid", gap: 14, maxWidth: 460 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Main line</h2>
        <Pill variant="good">Connected</Pill>
      </div>
      <p style={{ margin: 0 }}>
        Answers in 2 rings, books appointments, and sends a summary after every
        call.
      </p>
      <div style={{ display: "flex", gap: 10 }}>
        <Button>Test call</Button>
        <Button variant="primary">Edit agent</Button>
      </div>
    </Box>
  );
}
