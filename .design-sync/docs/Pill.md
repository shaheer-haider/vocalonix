---
category: Primitives
---

Small inline status token. Use for state that belongs next to a label, never as a button.

```tsx
<Pill variant="good">Connected</Pill>
<Pill variant="warn">Needs attention</Pill>
```

- `variant`: `default` | `solid` | `accent` | `good` | `warn` | `info`.
- Renders a `<span>`; all span attributes pass through.
