---
category: Shell
---

Centred card frame for login, signup and verification screens.

```tsx
<AuthShell width={420}>
  <h1>Log in</h1>
  <TextField label="Email" />
  <Button variant="primary" type="submit">Continue</Button>
</AuthShell>
```

`width` (default `480`) sets the card's `max-width`.
