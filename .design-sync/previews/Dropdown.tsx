// The menu opens on click, so a static card can only show the trigger. Cells
// therefore vary the trigger and the item set rather than the open panel.
import { Box, Button, Dropdown } from "@vocalonix/web";

const noop = () => undefined;

const items = [
  { label: "Use Gemini Live", onSelect: noop },
  { label: "Copy embed snippet", onSelect: noop },
  { label: "Download transcript", onSelect: noop },
  { label: "Delete conversation", onSelect: noop, disabled: true },
];

export function Default() {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <Dropdown label="Actions" items={items} />
    </div>
  );
}

export function CustomTriggerLabel() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Dropdown label="Last 30 days" items={items} />
      <Dropdown label="Export" items={items.slice(0, 2)} />
    </div>
  );
}

export function InAPanelHeader() {
  return (
    <Box style={{ padding: 22, display: "grid", gap: 14, maxWidth: 460 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0 }}>Conversations</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Dropdown label="Actions" items={items} />
          <Button variant="primary">New test call</Button>
        </div>
      </div>
      <p style={{ margin: 0 }}>
        The menu opens on click and supports arrow keys, Escape and
        outside-click dismissal.
      </p>
    </Box>
  );
}
