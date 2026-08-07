---
category: Shell
---

Public page frame: the top nav plus a `<main>` for the page body. The outermost element of every marketing/public route.

```tsx
<PageShell>
  <section className="page-heading">…</section>
</PageShell>
```

Set `nav={false}` for pages that supply their own header.
