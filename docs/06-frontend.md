# Frontend

React 19 + Vite 6 + TanStack Router + TanStack Query. A static SPA — there is no
SSR and no Node process in front of it in production, just nginx serving a
build.

## Entry

```
main.tsx
  QueryClientProvider
    AuthProvider          restores the session, exposes user + refresh
      RouterProvider      router.tsx
```

## Routing

Every route is declared in `app/web/src/router.tsx` — there is no file-based
routing, so that file is the complete map of the product.

Public entry points (`LandingPage`, `LoginPage`, `SignupPage`, `MagicLinkPage`,
`VerifyEmailPage`) are imported eagerly because they are the first paint.
**Everything behind auth is lazy** via `lazyRouteComponent`; before that split, a
visitor to the marketing page downloaded the whole workspace app — tenant
settings, the diary, contacts — in one 596 kB chunk before the hero rendered.
Keep new authenticated routes lazy.

Guarded routes share `beforeLoad: requireSession`, which calls `loadSession()`
and redirects to `/login?redirect=…` when there is none.

`loadSession()` (`auth/session.ts`) is a 30-second single-flight cache. It exists
because `AuthProvider`'s mount effect and every route guard were each firing
`GET /api/auth/session` independently. It is a **redirect convenience, not a
security boundary** — the API re-checks every request — which is what makes the
short TTL an acceptable trade. Call `setCachedSession()` after anything that
changes who is signed in.

Document titles are derived from the matched path by a regex table at the bottom
of `router.tsx`. Add an entry when you add a route, or it inherits the bare
product name and browser history becomes ambiguous.

### The route table

| Path | Component | Access |
|---|---|---|
| `/` | `LandingPage` | public |
| `/demo` | `DemoPage` | public |
| `/pricing` | `PricingPage` | public |
| `/terms`, `/privacy` | `legal.tsx` | public |
| `/login`, `/signup`, `/magic`, `/verify-email` | `public.tsx` | public |
| `/invite/$token` | `InvitationPage` | public page, signed-in acceptance |
| `/app` | `AppHomePage` | session |
| `/app/onboarding/create` | `CreateBusinessPage` | session |
| `/app/$businessSlug/dashboard` | `WorkspaceDashboardPage` | member |
| `/app/$businessSlug/conversations` | `WorkspaceConversationsPage` | member |
| `/app/$businessSlug/contacts` | `WorkspaceContactsPage` | member |
| `/app/$businessSlug/bookings` | `WorkspaceBookingsPage` | member |
| `/app/$businessSlug/callbacks` | `WorkspaceCallbacksPage` | member |
| `/app/$businessSlug/notifications` | `WorkspaceNotificationsPage` | **prototype — see below** |
| `/app/$businessSlug/team` | `TeamPage` | member |
| `/app/$businessSlug/account` | `WorkspaceAccountPage` | member |
| `/app/$businessSlug/onboarding/$step` | `TenantOnboardingPage` | member |
| `/app/$businessSlug/settings[/section]` | `TenantSettingsPage` | member |
| `/account`, `/account/security` | `account.tsx` | session |
| `/design-system` | `DesignSystemPage` | internal reference |

`/settings/*` sections all render `TenantSettingsPage` with a `section` prop
rather than separate components — `business`, `appearance`, `history`, `agent`,
`knowledge`, `hours`, `phone`, `widget`.

## Where the code lives

The route files are large. These are the landmarks.

| File | Lines | Exports and what is inside |
|---|---:|---|
| `routes/tenant.tsx` | ~3000 | The whole tenant surface. Exports only `TenantOnboardingPage`, `TenantSettingsPage`, `KnowledgeWorkspace`. Internals: `ProfileForm`, `AgentForm`, `VoicePicker`, `WidgetForm`, `HoursForm`, `KnowledgeManager`, `AnswersTab`, `GapsTab`, `BrowserTestCall`, `ReviewPublish`, `DiffModal`, `PublishBanner`, `AppearanceForm`, `WidgetTab`, `CodeSnippet`, `HistoryTab`, `PhoneTab`, `PooledNumbers` |
| `routes/business.tsx` | ~2050 | `WorkspaceShell` (the nav frame), `CreateBusinessPage`, `WorkspaceDashboardPage`, `WorkspaceBilling`, `TeamPage`, `InviteMemberModal`, `InvitationPage`, `PlatformReadiness`, `COUNTRY_OPTIONS`, `useBusinessSlug` |
| `routes/operations.tsx` | ~1660 | `WorkspaceBookingsPage`, `WorkspaceCallbacksPage`, `NewBookingForm`, `BookingsSetup` |
| `routes/demo.tsx` | ~1150 | The funnel as a step machine: `VerticalStep`, `BusinessStep`, `IntakeStep`, `VoiceStep`, `LiveCall`, `WrapStep` |
| `routes/contacts.tsx` | ~860 | Contacts list, import, detail |
| `routes/public.tsx` | ~615 | Landing and all auth screens |
| `routes/legal.tsx` | ~440 | Terms of Service and Privacy Policy. The operator's legal entity, registered address and governing law live in one `OPERATOR` constant at the top; blank renders the document *without* those clauses rather than with invented ones |
| `routes/conversations.tsx` | ~480 | Call list and transcript view |
| `routes/account.tsx` | ~230 | `/app` hub, account, security |
| `routes/notifications.tsx` | ~305 | **Prototype only** |

When adding to one of the big files, add near the related component rather than
at the end, and keep the single exported page component last.

## Data fetching

Everything goes through `app/web/src/api.ts`: an `edenTreaty<App>` client typed
directly from the API's `typeof app`, plus every request and response interface.

Rules:

- **Never `fetch` from a component.** Add the call and its types to `api.ts`.
- Wrap reads in `useQuery`, writes in `useMutation`, and invalidate the affected
  query keys on success.
- Errors arrive as `ApiClientError` with `.status`, `.code` and a `.message`
  written for a human. Render `.message`; branch on `.code`.
- `unwrap()` throws when `data` is null even without a transport error, so a
  malformed response fails at the call site rather than inside a render.

## Permissions in the UI

`app/web/src/permissions.ts` mirrors part of the server matrix so the UI can hide
what a role cannot do.

**It is a subset.** It covers `workspace.view`, `team.manage`, `billing.access`,
`business.delete`, `agent.edit`, `knowledge.manage` — and omits
`callbacks.manage`, `contacts.manage`, `bookings.manage`, `bookings.configure`.
That is tolerable only because the client copy is a hint: the server is the
authority and rejects with `403 MISSING_PERMISSION` regardless. If you add a
permission server-side and want the UI to respect it, add it here too.

## Styling

Hand-written CSS. No Tailwind, no CSS-in-JS.

- `styles.css` holds the design tokens on `:root` and the global classes.
  Colours, spacing (`--space-1`…`--space-7` on a 4px grid), radii, shadows,
  the focus ring, `--control-height`, and the type stack.
- Per-route stylesheets (`operations.css`, `contacts.css`,
  `conversations.css`, `notifications.css`) hold what only that route needs.
- **Use the tokens.** The space scale exists because cards previously wrote
  seven unrelated padding values inline.
- Foreground tokens are tuned to clear 4.5:1 against `--paper`, `--paper-2` and
  their own `--*-soft` surface, so a token is never the reason text fails
  contrast. Do not introduce off-scale colours.
- One focus indicator for the whole product. Every `outline: none` is paired
  with a ring. Never remove focus visibility.
- Motion is decorative except the spinner; everything is disabled under
  `prefers-reduced-motion: reduce`.

The visual language is deliberate — a hand-drawn, paper-and-ink look with
`Gochi Hand` / `Gaegu` / `Space Mono`. `/design-system` renders the primitives.

## UI primitives

`components/ui`: `Alert`, `Box`, `Button`, `ColorField`, `Dropdown`,
`EmptyState`, `Field`, `LoadingState`, `Modal`, `Pill`, `SelectField`,
`TextArea`, `TextField`, `VoiceOrb`. `Box` is the primary surface, composed at
runtime from a `tone` and a padding step.

`components/shell`: `PageShell`, `AuthShell`, `OnboardingShell`, `PublicNav`,
`RouteError` / `RouteNotFound`.

Check these before writing a new one. A one-off styled `<div>` where a `Box`
would do is how a design system dies.

## Forms

react-hook-form with zod resolvers. Validate on the client for feedback and
assume nothing: the API validates independently with Elysia's `t`.

## Navigation

TanStack Router `<Link>` and `navigate()`. An `<a href>` or `window.location`
pointing at an internal route is a bug — it reloads the SPA, drops query cache
and component state, and shows a white flash. This was a real defect that had to
be fixed across four route files; do not reintroduce it.

## The embeddable widget

`app/web/public/embed/vocalonix-widget.js` — ours, plain JavaScript, no build
step, shipped as a static asset.

- Renders entirely inside a **shadow root**, so it cannot break the host page's
  CSS and the host page cannot break it.
- Speaks Dograh's public embed protocol: config → init → TURN → WebSocket
  signalling → SDP.
- Derives label colour from the business's accent colour, because white text on
  a pale brand colour is unreadable.
- Matches the host page's light/dark.
- Real buttons, a focus trap while open, Escape to close, and a live region for
  status. A silent voice widget is indistinguishable from a broken one, so the
  panel narrates every step, including why the microphone was refused.
- Exposes `window.VocalonixWidget`, aliased to `window.DograhWidget` so snippets
  published before this file existed keep working.

`dograh/ui/public/embed/dograh-widget.js` is still served at
`/embed/dograh-widget.js` for exactly that reason. Vite serves it through a
plugin in dev and copies it into `dist/embed` on build. **Do not remove it.**

## Assets

Voice previews are 32 kbps AAC `.m4a` in `public/voices/`. Keep the format —
the uncompressed WAVs were 4.3 MB across the set.

## Build notes

- Vite reads `VITE_*` from the **repo-root** `.env` (`envDir` in
  `vite.config.ts`). Only `VITE_`-prefixed keys ever reach the browser.
- `app/web/types/` holds generated `.d.ts` files. Gitignored. Never hand-edit.
- The production image builds with Bun and serves the result from
  `nginx:1.27-alpine` using `app/web/nginx.conf`.
