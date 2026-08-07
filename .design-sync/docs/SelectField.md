---
category: Forms
---

Labelled native `<select>` built on `Field`, with the kit's caret. Options are data, not children.

```tsx
<SelectField
  label="Retrieval mode"
  value={mode}
  onChange={(e) => setMode(e.target.value)}
  options={[
    { label: "Full document", value: "full_document" },
    { label: "Chunked search", value: "chunked" },
  ]}
/>
```

`options` is `SelectOption[]` (`{ label, value }`) and is required.
