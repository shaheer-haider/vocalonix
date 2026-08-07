# Building with the Vocalonix kit

A warm "paper and ink" system: cream surfaces, near-black ink, a single brick-red
accent, and three handwritten/monospace faces. Everything is driven by CSS custom
properties — **there are no utility classes**. Never hardcode a colour, font or
shadow; if you reach for a hex value, the right token almost certainly exists.

## Setup

No provider is needed for anything under Primitives, Forms or Overlays — load the
kit's `styles.css` and the components are styled. Its `@import` closure pulls in the
compiled component CSS and the Google Fonts request for the three brand faces.

The four **Shell** components are different. `PublicNav` (alias `TopNav`), `SideNav`,
`OnboardingShell` and `PageShell` render `@tanstack/react-router` links and read the
current route; `PublicNav` also reads auth state. Outside that context they throw
`Invariant failed: Could not find a nearest match!` and render nothing. The kit
exports **`PreviewProvider`** for exactly this — it supplies a stub in-memory router
and a signed-out auth session:

```jsx
<PreviewProvider>
  <PageShell>…</PageShell>
</PreviewProvider>
```

`PublicNav` hides its middle section links below **980px** — render it at ≥1000px wide
or the header looks empty. `Modal` renders a `position: fixed` backdrop, so it covers
whatever viewport it is mounted in.

## The styling idiom

**Tokens, via `var(--*)`.** Surfaces `--paper` `--paper-2` `--paper-3` `--paper-glass`;
text `--ink` `--ink-2` `--ink-3` `--ink-4`; borders `--line` `--line-2`; brand
`--accent` `--accent-soft` `--accent-ink`; status `--good`/`--good-soft`,
`--warn`/`--warn-soft`, `--danger`/`--danger-soft`, `--info`/`--info-soft`; plus
`--overlay`, `--shadow-sketch` (resting) and `--shadow-raised` (lifted). Type:
`--hand` (Gochi Hand — wordmark/display only), `--kalam` and `--label` (Gaegu — the
body and heading face), `--mono` (Space Mono — eyebrows, labels, ids, timestamps).

**Semantic classes, not utilities.** Components own their own `ui-*` classes — never
write those yourself. For your own layout glue, use the kit's existing semantic
classes before inventing anything:

| Class | Use |
|---|---|
| `eyebrow` | Small uppercase mono kicker above a heading |
| `page-heading` | Title block: heading left, actions right |
| `stack-row` | Horizontal wrapping row of controls, 10px gap |
| `form-grid`, `form-grid--two` | Vertical field stack / two-column form |
| `design-grid` | Two-column panel grid |
| `modal-header` | Title + close row inside a `Modal` |
| `nav-item`, `nav-item--active`, `nav-label` | Sidebar link styling |
| `wordmark` | The Vocalonix wordmark in the display face |
| `data-table` | Grid-based table rows |

`h1`/`h2`/`h3` and `p` are already styled globally — write plain headings and
paragraphs rather than styling text yourself. `<a>` inherits `--accent-ink`. To make a
link look like a button, put the button classes on it: `class="ui-button ui-button--primary"`.

## Where the truth lives

Read the kit's `styles.css` and its imports before styling anything — it is the full
class and token vocabulary, and it beats this summary. Each component has a
`.prompt.md` next to it with its props and worked examples, and `guidelines/` holds
the project's own design guide.

## An idiomatic screen

```jsx
<PageShell>
  <section className="page-heading">
    <div>
      <p className="eyebrow">Acme Dental</p>
      <h1>Conversations</h1>
    </div>
    <div className="stack-row">
      <Dropdown label="Last 30 days" items={ranges} />
      <Button variant="primary">New test call</Button>
    </div>
  </section>

  <Box style={{ padding: 22, display: "grid", gap: 14 }}>
    <div className="stack-row" style={{ justifyContent: "space-between" }}>
      <h2 style={{ margin: 0 }}>Main line</h2>
      <Pill variant="good">Connected</Pill>
    </div>
    <p style={{ margin: 0, color: "var(--ink-3)" }}>
      Answers in 2 rings and sends a summary after every call.
    </p>
  </Box>
</PageShell>
```

Note the split: kit components for the controls and surfaces, kit classes plus token
`var(--*)` values for the glue. Inline `style` is fine for one-off spacing and layout;
it is not fine for colour, font or shadow — those come from tokens.

## Known gaps

Inputs have no `:disabled` styling (only buttons do), and buttons have no
`:focus-visible` style, so focused buttons show the browser default ring. Don't design
around these as if they were intentional.
