---
category: Forms
---

Label + control + message wrapper, and the base every other field is built on. It generates an id, wires `aria-describedby`, and renders error or helper text.

`children` is a **render prop**, not nodes:

```tsx
<Field label="Webhook URL" helper="We POST call summaries here." required>
  {({ id, descriptionId }) => (
    <input id={id} aria-describedby={descriptionId} className="ui-input" />
  )}
</Field>
```

- `error` takes precedence over `helper` and renders with `role="alert"`.
- Reach for `Field` directly only when wrapping a control the kit doesn't ship. For text, select, textarea and colour, use the dedicated field components.
