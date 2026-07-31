# Vocalonix UI revamp — end-to-end guide

This guide explains how to carry the Claude Design work in
`docs/design/claude-export/` into the real app, what is already done on this
branch, and what to do next, module by module.

## How to use the design export

Every `*.dc.html` file in `docs/design/claude-export/` is a self-contained
interactive mockup. Open it in a browser (with `support.js` next to it) to
click through the flows. The files use inline styles, so the design language
(colors, fonts, spacing) can be read straight out of the markup.

Reference pages:

| File | Module |
| --- | --- |
| `Vocalonix Foundations.dc.html` | Design tokens, type scale, components |
| `Vocalonix Dashboard.dc.html` | Dashboard (briefing layout) |
| `Vocalonix Conversations.dc.html` | Conversations list + transcript |
| `Vocalonix Contacts.dc.html` | Contacts |
| `Vocalonix Bookings.dc.html` | Day diary, drag-to-reschedule, setup tabs |
| `Vocalonix Callbacks.dc.html` | Callback/task queue |
| `Vocalonix Configuration.dc.html` | Business / Agent / Hours / Widget / Appearance / History tabs, publish + diff flow |
| `Vocalonix Knowledge.dc.html` | Sources / Answers / Gaps tabs |
| `Vocalonix Settings.dc.html` | Team / Account & billing / Notifications tabs |
| `Vocalonix Empty States.dc.html` | Empty, first-run, offline, integration-error states |
| `Vocalonix Mobile.dc.html` | 390px phone flows (diary, callbacks, calls) |
| `Vocalonix Auth.dc.html`, `Vocalonix Landing.dc.html`, `Vocalonix Onboarding.dc.html` | Public pages and onboarding |

## Design language (already applied on this branch)

All tokens live in `app/web/src/styles.css` under `:root`, so restyling is
mostly a token change:

- **Fonts:** Gochi Hand (`--hand`, wordmark/display), Gaegu (`--kalam` /
  `--label`, headings and body), Space Mono (`--mono`, labels, eyebrows,
  timestamps). Loaded via the Google Fonts `@import` at the top of
  `styles.css`.
- **Palette:** paper `#F7F3EB`, sidebar cream `#FDF8E9`, ink `#1D1A16`,
  lines `#CFC5AB` / `#E3DCC6`, accent red `#B2544E` (hover `#8E3E39`),
  good green `#4E7A48`.
- **Texture:** subtle radial-dot paper background, sketch shadows
  (`--shadow-sketch`, `--shadow-raised`).

When building new screens, do not hardcode colors — always use the CSS
variables so future theme work (the export's night/ink/studio themes) stays a
token swap.

## What this branch already does

- Commits the full design export to `docs/design/claude-export/`.
- Applies the fonts and palette globally (token-only change).
- Reworks the workspace sidebar (`WorkspaceFrame` in
  `app/web/src/routes/business.tsx`) into the designed IA:
  Today (Dashboard, Bookings, Callbacks) / Set up (Configuration, Knowledge) /
  Workspace (Team, Account & billing), plus the "Live & answering" status
  card.
- Rebuilds the Dashboard as briefing-style surface cards.
- Adds `/app/$businessSlug/bookings` and `/callbacks` as design previews with
  sample data (`app/web/src/routes/operations.tsx`).

## What to do next, in order

### 1. Component pass (frontend only)

Bring the shared components in `app/web/src/components/ui/` in line with
`Vocalonix Foundations.dc.html`: pill radii/borders, button hover states
(`border-color: var(--accent)` on hover), card borders `1px solid var(--line-2)`
with 11–12px radii, Space Mono eyebrows at 10px / 0.14em letter-spacing.

### 2. Replace existing screens with the designed versions

Each of these has a working backend today — it is a pure UI replacement:

- **Configuration** (`app/web/src/routes/tenant.tsx`): restructure
  `TenantSettingsPage` into the six designed tabs (Business, Agent, Hours,
  Widget, Appearance, History). The draft → "Changes pending" → Republish
  with diff view is the key flow (`Vocalonix Configuration.dc.html`); the
  History tab needs a small API addition for config versions.
- **Knowledge**: split into Sources / Answers / Gaps tabs per
  `Vocalonix Knowledge.dc.html`. Sources maps to today's document list;
  Answers needs per-answer editing; Gaps needs a backend feed of unanswered
  questions from conversations.
- **Team / Account & billing** (`TeamPage`, `WorkspaceAccountPage`): apply the
  `Vocalonix Settings.dc.html` layout — Team table with role +
  "In the chain" / "Wakes them" switches, escalation-chain rail; billing tab
  with plan card, minutes-used bar and invoices.
- **Auth, Landing, Onboarding** (`routes/public.tsx`,
  `TenantOnboardingPage`): match `Vocalonix Auth/Landing/Onboarding.dc.html`.

### 3. Empty and error states

Use `Vocalonix Empty States.dc.html` for every list screen's first-run state
(no conversations, no contacts, empty diary), plus agent-offline and
integration-disconnected banners. The shared `EmptyState` component in
`components/ui/` is the place to implement the pattern once.

### 4. New modules that need backend work

Replace the sample-data previews with real features:

- **Bookings**: needs booking/resource/availability tables (Drizzle),
  CRUD endpoints in `app/api`, and agent tooling in Dograh so the agent can
  hold and book slots. Then implement the full diary from
  `Vocalonix Bookings.dc.html` (hour grid, drag-to-reschedule with 10-minute
  snapping, slot holds, waitlist).
- **Callbacks**: needs a callback-task table fed by call outcomes
  (dispositions) and the bookings waitlist, with assignment + done-states.
  UI per `Vocalonix Callbacks.dc.html` (promise-time buckets, owner chips,
  team-load rail).
- **Conversations / Contacts** app pages: surface Dograh call transcripts per
  workspace, per `Vocalonix Conversations.dc.html` and
  `Vocalonix Contacts.dc.html`.
- **Notifications**: per-person event × Email/SMS/Push matrix with quiet
  hours (`Vocalonix Settings.dc.html`, Notifications tab).

### 5. Mobile

`Vocalonix Mobile.dc.html` collapses the sidebar to a four-tab bar, turns the
diary grid into a time-down list with person filter chips, and pushes detail
views as full screens. Implement as responsive breakpoints on the same routes
(the media queries at the bottom of `styles.css` are the starting point), not
a separate app.

### 6. Dashboard, for real

Once calls/bookings/callbacks data exists, upgrade the Dashboard to the full
briefing from `Vocalonix Dashboard.dc.html`: calls-answered / handled-alone /
callback / average-length stats, "when people call" chart, topic mix,
knowledge-gap and callback surfaces, and the "Today in the diary" rail.

## Working rules

- Keep every change token-based and component-based; no per-screen colors.
- Real data only on live screens — anything sample-driven must carry the
  "Design preview" alert until its backend lands.
- Run `bun run typecheck` and `bun run build` before each PR
  (`git submodule update --init --recursive` first, so the Dograh widget
  copy step in the web build succeeds).
