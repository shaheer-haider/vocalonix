---
category: Shell
---

Marketing header: wordmark, section links, and the auth actions. Reads auth state itself and swaps between `Log in` / `Create account` and `Open app`, so it takes no props.

```tsx
<PublicNav />
```

Also exported as `TopNav`. Must render inside the router and auth providers. `PageShell` renders it for you — mount it directly only when building a custom frame.
