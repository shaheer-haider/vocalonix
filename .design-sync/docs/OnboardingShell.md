---
category: Shell
---

Two-column setup frame: a sidebar with a progress bar and numbered step list, and a content column.

```tsx
<OnboardingShell
  title="Set up Acme Dental"
  businessSlug="acme-dental"
  currentSlug="hours"
  steps={[
    { slug: "business", label: "Business details", done: true },
    { slug: "hours", label: "Opening hours" },
    { slug: "voice", label: "Pick a voice" },
  ]}
>
  …
</OnboardingShell>
```

Completed steps become links back to that step; the current and upcoming steps are inert. Progress is derived from `steps`, so don't pass a percentage.
