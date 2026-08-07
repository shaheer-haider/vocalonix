---
category: Forms
---

Labelled text input built on `Field`. Forwards its ref to the `<input>`.

```tsx
<TextField label="Agent name" value={name} onChange={(e) => setName(e.target.value)} />
<TextField label="API key" mono error="That key was rejected." />
```

- `mono` switches the input to the `--mono` family — use it for keys, ids and snippets.
- `label`, `helper`, `error`, `required` go to `Field`; every other `<input>` attribute passes through.
