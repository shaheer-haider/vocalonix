import { Box, SideNav } from "@vocalonix/web";

const items = [
  { to: "/app/acme/conversations", label: "Conversations" },
  { to: "/app/acme/contacts", label: "Contacts" },
  { to: "/app/acme/bookings", label: "Bookings" },
  { to: "/app/acme/callbacks", label: "Callbacks" },
  { to: "/app/acme/knowledge", label: "Knowledge" },
];

export function WithActiveItem() {
  return (
    <div style={{ maxWidth: 260 }}>
      <SideNav label="Workspace" items={items} />
    </div>
  );
}

export function WithIcons() {
  return (
    <div style={{ maxWidth: 260 }}>
      <SideNav
        label="Acme Dental"
        items={[
          { to: "/app/acme/conversations", label: "Conversations", icon: <span aria-hidden>☎</span> },
          { to: "/app/acme/contacts", label: "Contacts", icon: <span aria-hidden>◍</span> },
          { to: "/app/acme/bookings", label: "Bookings", icon: <span aria-hidden>▤</span> },
        ]}
      />
    </div>
  );
}

export function AlongsideContent() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0, 1fr)", gap: 24 }}>
      <SideNav label="Workspace" items={items} />
      <Box style={{ padding: 22 }}>
        <h2 style={{ marginTop: 0 }}>Conversations</h2>
        <p style={{ margin: 0 }}>
          The nav marks the current route automatically — no active prop to pass.
        </p>
      </Box>
    </div>
  );
}
