---
category: Primitives
---

Ink-outlined action button. `variant` is the primary appearance axis; `loading` disables the button and swaps the label for `Working…`.

```tsx
<Button variant="primary" onClick={save}>Save changes</Button>
<Button variant="ghost">Cancel</Button>
<Button variant="destructive" loading={deleting}>Delete workspace</Button>
```

- `variant`: `default` (paper with ink border) | `primary` (filled ink) | `ghost` (borderless) | `accent` (brand red) | `destructive`.
- Renders a real `<button>`; every native button attribute passes through. `type` defaults to `"button"`, so it will not submit a form unless you set `type="submit"`.
- Use one `primary` per view. `accent` is for the marketing surfaces, not for in-app confirmation.
