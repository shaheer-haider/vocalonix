---
category: Shell
---

In-app sidebar navigation. Marks the active item from the current route (exact match or a prefix of it) and sets `aria-current="page"`.

```tsx
<SideNav
  label="Workspace"
  items={[
    { to: "/app/acme/conversations", label: "Conversations", icon: <ChatIcon /> },
    { to: "/app/acme/contacts", label: "Contacts" },
  ]}
/>
```

`items` is `SideNavItem[]` (`{ to, label, icon? }`). `label` names the `<nav>` and renders as its heading. Requires router context.
