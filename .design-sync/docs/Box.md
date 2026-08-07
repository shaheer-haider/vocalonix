---
category: Primitives
---

Paper surface panel — the default container for a block of content. Applies the sketch border, radius and shadow so you never hand-roll a card.

```tsx
<Box style={{ padding: 22 }}>
  <h2>Buttons and pills</h2>
  …
</Box>
```

- `tone`: `default` (paper) | `tinted` (`--paper-2`) | `accent` (`--accent-soft`).
- Box owns background, border, radius and shadow. Pass `style` for padding and layout only — overriding the surface defeats the point.
