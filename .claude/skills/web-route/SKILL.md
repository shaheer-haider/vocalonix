---
name: web-route
description: Build or change a page, component or style in the Harkbell web app. Use for work under app/web/src — routes, UI primitives, styles.css, forms, data fetching, or the embeddable widget. Covers the router, lazy boundaries, the Eden/TanStack Query pattern, design tokens, and how to verify in the browser.
---

# Frontend work

React 19, Vite 6, TanStack Router, TanStack Query, react-hook-form + zod,
hand-written CSS. No SSR, no CSS framework, no component library.

## Adding a route

Every route is declared in `app/web/src/router.tsx` — there is no file-based
routing, so that file is the complete map.

```ts
const workspaceThingsRoute = createRoute({
  getParentRoute: () => workspaceRoute,   // inherits requireSession + /app/$businessSlug
  path: "/things",
  component: WorkspaceThingsPage,
});
```

Then:

1. **Lazy-load it.** `const WorkspaceThingsPage = lazyPage(() => import("./routes/things"), "WorkspaceThingsPage")`.
   Public entry points stay eager because they are the first paint; everything
   behind auth is split, or a visitor to the marketing page downloads the whole
   workspace app before the hero renders.
2. **Add it to `routeTree`.** A route that is not in the tree does not exist.
3. **Add a `ROUTE_TITLES` entry.** Otherwise it inherits the bare product name
   and browser history becomes ambiguous.
4. Guarded routes get `beforeLoad: requireSession` — or inherit it from
   `workspaceRoute`.

New settings sections render `TenantSettingsPage` with a `section` prop rather
than a new component.

## Data

Everything goes through `app/web/src/api.ts` — an `edenTreaty<App>` client typed
from the API's own `typeof app`, plus every request and response interface.

- **Never `fetch` from a component.** Add the call and its types to `api.ts`.
- Reads in `useQuery`, writes in `useMutation`, invalidate affected keys on
  success.
- Errors arrive as `ApiClientError` with `.status`, `.code` and a `.message`
  written for a human. Render `.message`; branch on `.code`.

If the API's response shape changed, `bun run typecheck` fails on the **web**
side. That is the contract working.

## Permissions

`import { can } from "../permissions"` to hide controls a role cannot use. The
client matrix is a **subset** of the server's — it omits `callbacks.manage`,
`contacts.manage`, `bookings.manage`, `bookings.configure`. Add the permission
there if the UI should respect it. Hiding is a courtesy; the server rejects
regardless.

## Components

Check `components/ui` before writing anything new: `Alert`, `Box`, `Button`,
`ColorField`, `Dropdown`, `EmptyState`, `Field`, `LoadingState`, `Modal`,
`Pill`, `SelectField`, `TextArea`, `TextField`, `VoiceOrb`. `Box` is the primary
surface — compose it with `tone` and a padding step rather than styling a
`<div>`.

Shells live in `components/shell`: `PageShell`, `AuthShell`, `OnboardingShell`,
`PublicNav`, `RouteError`.

`/design-system` renders the primitives.

## Styling

- Tokens on `:root` in `styles.css`: colours, `--space-1`…`--space-7` on a 4px
  grid, radii, shadows, `--focus-ring`, `--control-height`, the type stack.
- **Use them.** The space scale exists because cards previously wrote seven
  unrelated padding values inline.
- Foreground tokens are tuned to clear 4.5:1 against `--paper`, `--paper-2` and
  their own `--*-soft` surface. Do not introduce off-scale colours.
- One focus indicator for the whole product. Every `outline: none` is paired
  with a ring. Never remove focus visibility.
- Motion is decorative except the spinner, and is disabled under
  `prefers-reduced-motion: reduce`.
- Route-specific rules go in the route's own CSS file, not `styles.css`.

The visual language is a deliberate hand-drawn paper-and-ink look. Match it.

## Navigation

TanStack Router `<Link>` and `navigate()`. An `<a href>` or `window.location`
for an internal route is a bug — full reload, dropped query cache, white flash.
This had to be fixed across four route files; do not reintroduce it.

## Forms

react-hook-form with a zod resolver. Client validation is for feedback only —
the API validates independently.

## The big files

`tenant.tsx` (~3000 lines), `business.tsx` (~2050), `operations.tsx` (~1660).
Add near the related component, not at the end, and keep the exported page
component last. `docs/06-frontend.md` has the landmark table.

## The widget

`app/web/public/embed/vocalonix-widget.js` — plain JavaScript, no build step,
runs on **other people's websites**. Everything renders in a shadow root so it
cannot break their CSS and they cannot break it. It exposes
`window.VocalonixWidget`, aliased to `window.DograhWidget` for snippets
published before it existed.

Test it on a genuinely different origin, not just in the dashboard:

```bash
cd /tmp && printf '<!doctype html><div id="dograh-inline-container"></div>%s' \
  '<script src="http://localhost:3000/embed/vocalonix-widget.js?token=…" async></script>' > w.html
python3 -m http.server 8099
```

Check the launcher, the panel, host-theme matching, the mobile sheet layout, and
the microphone-denied path.

## Verify

There are **no frontend tests**. Verification is the browser.

```bash
docker compose up -d --build --wait vocalonix-web
```

First confirm you are looking at your own code — containers report healthy while
serving a stale image:

```bash
curl -sS http://localhost:3000/ | grep -o 'assets/index-[^"]*\.js'
```

Then, using the Browser pane: console clean, network 2xx, keyboard reachable
(tab through it), and check both ~420px and desktop width. Take a screenshot for
the PR.

Watch for horizontal page scroll specifically — `overflow-wrap: break-word` does
not clamp intrinsic min-content width, so a long unbreakable string can widen the
whole page even when the element reports no internal overflow. Assert it:

```js
document.documentElement.scrollWidth <= document.documentElement.clientWidth
```

## Finish

- [ ] Route in `router.tsx`, in `routeTree`, lazy, with a `ROUTE_TITLES` entry
- [ ] Data through `api.ts` + TanStack Query, not `fetch`
- [ ] `<Link>`/`navigate()`, never `<a href>` internally
- [ ] Existing primitives and design tokens used
- [ ] Focus visible, keyboard reachable, reduced motion respected
- [ ] Checked at ~420px and desktop, console clean
- [ ] No horizontal page scroll
- [ ] User-visible strings say Harkbell
