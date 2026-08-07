---
category: Forms
---

Labelled multi-line input built on `Field`. Grows with its content by default.

```tsx
<TextArea label="Greeting" value={greeting} onChange={(e) => setGreeting(e.target.value)} />
```

- `autoResize` defaults to `true`; set it `false` for a fixed-height box with its own `rows`.
- Forwards its ref to the `<textarea>`.
