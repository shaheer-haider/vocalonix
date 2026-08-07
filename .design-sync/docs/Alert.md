---
category: Primitives
---

Inline message block. Sets `role="alert"` for `warn`/`error` and `role="status"` otherwise, so it announces correctly without extra wiring.

```tsx
<Alert variant="warn" title="Verify your email">
  We sent a link to nova@acme.co.
</Alert>
```

- `variant`: `info` | `success` | `warn` | `error`.
- `title` renders as a leading `<strong>`; body content is `children`.
