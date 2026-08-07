---
category: Overlays
---

Accessible dialog. Traps focus, closes on Escape, and returns focus to the trigger. You own the open state.

```tsx
<Modal open={open} onClose={() => setOpen(false)} titleId="rename-title">
  <div className="modal-header">
    <h2 id="rename-title">Rename agent</h2>
    <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
  </div>
  …
</Modal>
```

- `titleId` is **required** and must match the `id` of the heading you render inside — that's what labels the dialog.
- `descriptionId` is optional and wires the description.
- Renders nothing when `open` is false.
