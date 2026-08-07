---
category: Forms
---

Paired colour swatch and hex input built on `Field`. Both halves edit the same value.

```tsx
<ColorField label="Widget accent" value={accent} onChange={setAccent} />
```

`onChange` receives the string value directly — not an event. `value` must be a hex string the native colour input accepts (`#b2544e`).
