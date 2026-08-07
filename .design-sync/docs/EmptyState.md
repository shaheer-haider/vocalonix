---
category: Primitives
---

Placeholder for a list or panel with nothing in it yet. `title` is required; `icon`, `children` (supporting copy) and `action` are optional.

```tsx
<EmptyState title="No conversations yet" action={<Button variant="primary">Start a test call</Button>}>
  Calls appear here as soon as your agent picks up.
</EmptyState>
```

Prefer this over an ad-hoc centred `<div>` — it carries the kit's spacing and type scale.
