---
category: Overlays
---

Menu button. Opens on click, supports arrow keys, Escape and outside-click, and restores focus to the trigger.

```tsx
<Dropdown
  label="Actions"
  items={[
    { label: "Use Gemini Live", onSelect: switchModel },
    { label: "Copy snippet", onSelect: copy },
    { label: "Delete", onSelect: remove, disabled: !canDelete },
  ]}
/>
```

`items` is `DropdownItem[]` (`{ label, onSelect, disabled? }`). Each `onSelect` fires and closes the menu. This is a menu, not a select — for choosing a value use `SelectField`.
