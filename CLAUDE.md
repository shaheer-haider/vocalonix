# Harkbell — working agreement for Claude Code

This is the file to read first, every session. It is the map and the rules.
Depth lives in [`docs/`](docs/README.md); this file stays short enough to be
read in full before touching anything.

**The product is going live.** Treat `main` as production. Every change is
judged by whether it can be deployed on a Friday afternoon without a runbook.

---

## 1. What this is

A multi-tenant AI receptionist. A business signs up, configures its agent
(persona, voice, opening hours, services, knowledge), and publishes. That agent
then answers on the business's own website through an embeddable widget and, if
a number is connected, on the phone. Calls produce bookings, callbacks,
contacts, conversations and knowledge gaps in the dashboard.

The voice itself is not ours: a self-hosted **Dograh** engine (git submodule at
`dograh/`) runs the calls. Harkbell generates and owns each tenant's workflow on
that engine, and is the only thing that ever holds Dograh credentials.

### Naming — read this before you "fix" anything

The product is **Harkbell**. It was renamed from **Vocalonix** before launch;
nobody ever used it under the old name.

| Layer | Name | Change it? |
|---|---|---|
| UI, emails, what the agent says on a call | Harkbell | Yes — must be Harkbell |
| Environment variable names, including everything in Infisical | Harkbell | Yes — `HARKBELL_*`, or no prefix at all where the name already reads plainly (`API_PUBLIC_URL`, `AUTH_SECRET`) |
| GitHub repo, Docker image/container/volume names, `/opt/vocalonix` on the boxes, Postgres db + role, `window.VocalonixWidget`, `x-vocalonix-agent-key` and the `vocalonix-agent-tools:` hash prefix behind it, workflow node ids (`vocalonix-start`…) | vocalonix | **No.** Renaming these is an outage with no user-visible benefit |

A rename of an infrastructure identifier is never an incidental part of another
change. If a customer can read it, it says Harkbell. Otherwise leave it alone.

Variable names were the exception, renamed deliberately in one pass while
production was torn down and Infisical was being seeded — there was no running
box to break, and the names are the thing the operator reads every day. That
window is closed; treat them as load-bearing again now.

---

## 2. Stack

| Piece | Choice | Notes |
|---|---|---|
| Runtime | Bun 1.1.45 | Pinned in `engines`; CI and Docker use the same |
| Monorepo | Bun workspaces | `app/api`, `app/web` |
| API | Elysia 1.1 | `app/api/src/index.ts` composes route plugins |
| DB | PostgreSQL 16 + Drizzle ORM 0.45 | Schema `app/api/src/db/schema.ts`, SQL migrations in `app/api/drizzle/` |
| Auth | better-auth 1.6 | Cookie `vocalonix_session`, HTTP-only |
| Validation | zod 4 (env, domain) + Elysia `t` (request bodies) | Both; see §6 |
| Web | React 19, Vite 6, TanStack Router 1.121, TanStack Query 5 | SPA, no SSR |
| Forms | react-hook-form + zod resolvers | |
| Styling | Hand-written CSS, no framework | `app/web/src/styles.css` + per-route CSS |
| API types in web | `@elysiajs/eden` treaty over `typeof app` | End-to-end types, no codegen |
| Voice engine | Dograh v1.41.0 (submodule) | Python; **we do not modify it** |
| Telephony | Telnyx | |
| Billing | Stripe (raw REST, no SDK) | |
| Email | Resend | |
| Deploy | Docker Compose on Hetzner, Caddy TLS, GitHub Actions | |

---

## 3. Commands

```bash
bun install --frozen-lockfile
```

| Task | Command |
|---|---|
| Typecheck both workspaces | `bun run typecheck` |
| Run the API test suite | `bun run test` |
| Build both | `bun run build` |
| App only (needs a Dograh already running) | `./scripts/dev-app.sh` |
| Full stack, first run | `./scripts/setup.sh && docker compose up -d --build --wait` |
| Generate a migration after a schema edit | `bun run db:generate` |
| Apply migrations | `bun run db:migrate` |
| Inspect the database | `bun run db:studio` |
| Stop the stack | `docker compose down` |

Local ports: web `3000`, API `3001`, Dograh engine `8000`, Dograh UI `3010`,
Harkbell Postgres `5433`.

**Do not start dev servers with `Bash`.** Use the Browser pane's
`preview_start` (`.claude/launch.json` defines `web`) or Docker Compose.

---

## 4. Repository map

```
app/api/src/
  index.ts            Elysia app: CORS, error mapping, plugin composition,
                      boot reconcilers. Also the legacy single-workflow
                      /api/agent* + /api/knowledge* endpoints (see §9).
  env.ts              zod-validated environment. Refuses to boot if invalid.
  errors.ts           ApiError(status, code, message) — the only error you throw.
  worker.ts           Background loop: outbox, run ingestion, heartbeat.
  outbox.ts           Transactional outbox: enqueue, claim, retry, recover.
  rateLimit.ts        In-memory per-IP limiter (single instance only — §10).
  pagination.ts       parseListQuery: the shared limit/offset contract.
  uploads.ts          Upload allow-list + magic-byte sniffing.
  voices.ts           Voice catalogue, per-provider ids.
  verticals.ts        11 trades: intake fields, defaults, VERTICAL_AGENT_RULES.

  auth/               better-auth config, signup/login/magic-link routes,
                      password reset, Resend email, link capture for local
                      preview links.
  workspace/          Tenancy primitives. context.ts = requireSession /
                      requireWorkspace / requirePermission. permissions.ts =
                      the role matrix. routes.ts = businesses, team, invites.
  tenant/             The workspace product surface — 2.6k lines, the biggest
                      file in the repo. Settings, publish, knowledge, phone,
                      conversations, dashboard, callbacks, contacts, bookings,
                      knowledge gaps.
  billing/            plans.ts (catalogue), limits.ts (enforcement at
                      acquisition), routes.ts (Checkout, portal, webhook).
  platform/           Operator-facing plumbing. providers.ts + voiceStack.ts
                      push speech providers into Dograh; telephony.ts +
                      telnyx.ts own phone numbers; routes.ts = readiness panel.
  agent/              Callbacks the *engine* makes into us mid-call:
                      availability, book, message. slots.ts = availability math.
  dograh/             Engine integration. client.ts (HTTP), config.ts (workflow
                      generator + hashing), tenant.ts (sync state machine),
                      ingest.ts (pull runs → call_records, contacts, gaps),
                      agent-tools.ts (tool registration), extract.ts (LLM
                      transcript mining), errors.ts (failure classification),
                      workflow.ts (legacy single-workflow path — §9).
  demo/               Public no-signup demo funnel and its throwaway workflow.
  db/                 client.ts, schema.ts, migrate.ts.

app/web/src/
  main.tsx            Mount: QueryClientProvider → AuthProvider → RouterProvider.
  router.tsx          Every route, lazy boundaries, auth guard, document titles.
  api.ts              Eden treaty client + every request/response type (1k lines).
  routes/
    public.tsx        Landing, login, signup, magic link, verify email.
    demo.tsx          The public demo funnel.
    account.tsx       /app hub, account, security.
    business.tsx      Workspace shell + nav, create business, dashboard,
                      billing panel, team, invitation acceptance.
    tenant.tsx        Onboarding wizard + all settings sections. 3k lines;
                      TenantOnboardingPage and TenantSettingsPage are the
                      only exported entry points.
    operations.tsx    Bookings diary and callbacks.
    contacts.tsx      Contacts.
    conversations.tsx Call list and transcripts.
    notifications.tsx PROTOTYPE — local state, no backend. See §9.
  components/ui/      The primitives. Box, Button, Field, Modal, … Use these.
  components/shell/   Page shells and route error boundaries.
  styles.css          Design tokens on :root plus global classes.
  public/embed/vocalonix-widget.js
                      Our widget. Shadow DOM, speaks Dograh's public embed
                      protocol, exposes window.VocalonixWidget.

dograh/               Vendored engine. Read it to understand behaviour.
                      Never edit it. Upgrades = bump the submodule, on purpose.
scripts/              setup.sh (secrets + .env), start.sh, dev-app.sh
deploy/hetzner/       Production compose, Caddy, generate-env.sh, runbook
terraform/            OpenTofu for the Hetzner servers
docs/                 The detailed documentation
```

---

## 5. The five things that will bite you

1. **Multi-tenancy is enforced in exactly one place.** Every workspace route
   starts with `requireWorkspace(request.headers, params.slug)` and then
   `requirePermission(role, "…")`. `requireWorkspace` joins `businesses` to an
   *active* `memberships` row for the session user, so a non-member gets 404,
   not 403. A route that queries by `businessId` without going through it is a
   cross-tenant data leak. There is no ORM-level tenant scoping to save you.

2. **Configuration reaches the engine asynchronously, through the outbox.**
   Route handlers write to Postgres and `enqueueOutbox(...)`. The **worker**
   calls Dograh. If the worker is not running, nothing publishes and the UI
   sits in "pending" forever. When a local change appears not to work, check
   the worker first.

3. **The config hash decides whether anything happens at all.**
   `tenantDesiredConfiguration()` hashes the whole desired workflow;
   `synchronizationDecision()` no-ops when the hash matches what was last
   synced. If you change the shape of a generated workflow, **bump
   `TENANT_CONFIG_VERSION` in `app/api/src/dograh/config.ts`** — it is part of
   the hash, so bumping it re-syncs every business on the next deploy. Forget
   it, and your change ships to new tenants only.

4. **The engine calls back into us mid-call.** `/api/agent-tools/:businessId/*`
   is authenticated with the `x-vocalonix-agent-key` header, whose value is
   `sha256("vocalonix-agent-tools:" + AUTH_SECRET)`. It has no session and no
   CSRF. The tool URL is part of the config hash, so moving the API
   re-registers every agent automatically — that is deliberate, don't
   "optimise" it out.

5. **The browser never receives Dograh credentials.** It gets a short-lived
   embed token minted server-side, and that is all. Any change that puts an
   engine URL with a key, a service password, or a provider key into a `VITE_*`
   variable or a client bundle is a security regression.

---

## 6. Conventions to follow, because the codebase already does

- **Errors:** throw `new ApiError(status, CODE, "Sentence for a human.")`.
  `index.ts` maps it. Codes are `SCREAMING_SNAKE`; messages are full sentences
  the UI can show unedited. Never leak a provider's raw error to a user.
- **Validation:** request bodies use Elysia's `t.Object({...})` in the route's
  second argument (this is what gives the web app its types through Eden).
  Anything else — env, config, parsing — uses zod.
- **Money, limits, plans:** plan definitions live in `billing/plans.ts`; Stripe
  price ids live in the environment. A plan with no price id is simply not
  offered. Limits are checked at acquisition only — never retroactively delete
  a downgraded workspace's resources.
- **Timezones:** every business has one. Booking and availability maths goes
  through `agent/slots.ts` (`zonedTimeToUtc`, `todayInTimeZone`,
  `weekdayInTimeZone`). Do not reach for `new Date()` arithmetic in a handler.
- **Comments explain *why*.** This codebase's comments are unusually good:
  they record the failure that motivated the code. Match that. Do not add
  comments that restate the line beneath them.
- **Frontend navigation** uses TanStack Router `<Link>` / `navigate()`. An
  `<a href>` or `window.location` to an internal route is a bug — it reloads
  the SPA and drops state.
- **Frontend data** goes through TanStack Query with the Eden client in
  `api.ts`. Add the type there; don't `fetch` from a component.
- **UI primitives** come from `components/ui`. Before adding a new one, check
  whether `Box`, `Field`, `Pill`, `EmptyState` or `Alert` already covers it.
- **Naming:** `camelCase` in TypeScript, `snake_case` in the database, and
  Drizzle bridges the two explicitly in `schema.ts`.

---

## 7. Definition of done

A change is not finished until all of these are true. No exceptions for
"small" changes — see §9 for how a green suite shipped an unreachable phone
number.

- [ ] `bun run typecheck` clean
- [ ] `bun run test` green, **and the change is covered by a new or extended
      test** if it contains any logic (branching, maths, parsing, state)
- [ ] Schema change → migration generated with `bun run db:generate`, committed,
      and `bun run db:migrate` applied cleanly against a fresh database
- [ ] Workflow shape change → `TENANT_CONFIG_VERSION` bumped
- [ ] New workspace route → `requireWorkspace` + `requirePermission`, and the
      permission added to the matrix in `workspace/permissions.ts`
- [ ] New env var → added to `env.ts` (with a production rule if it is required
      in production), `.env.example`, and `scripts/setup.sh` if it is a
      generated secret
- [ ] User-visible strings say Harkbell, not Vocalonix
- [ ] Docs updated when behaviour changed: `docs/` for how it works, `STATUS.md`
      for what is and is not built
- [ ] The change was actually exercised — not just typechecked. Docker Compose
      for anything touching the engine, worker, or a real call path

Work on a branch, open a PR, keep the subject line in the imperative present
("Keep a released number instead of handing it back"). Commit and push only
when asked.

---

## 8. Testing reality

174 tests across 20 files, all passing, and **all of them are unit tests.** Not
one exercises an HTTP route.

That is the single biggest quality gap in the repo, and it has already cost:
a phone number reached production able to bill monthly and unable to ring,
because every unit passed and nothing tested the path they formed.

So: when you touch a route, the honest options are to add an integration test
for it (best — and if you do, it is the first one and worth doing well), or to
exercise it against the running Compose stack and say so in the PR. "Tests
pass" is not evidence that a route works. See [`docs/09-testing.md`](docs/09-testing.md).

---

## 9. Known landmines

| Thing | Status |
|---|---|
| `routes/notifications.tsx` | A **prototype**. 305 lines of `useState`, zero API calls, no endpoints, no tables. Nothing persists, nothing is ever sent. Do not build on it or cite it as a feature. |
| `dograh/workflow.ts` + `/api/agent*`, `/api/knowledge*` in `index.ts` | The **legacy single-workflow path** from before multi-tenancy. Session-guarded but not tenant-scoped. Slated for removal. Never route new work through it. |
| Rate limiting | In-memory. Correct for one API instance, silently useless behind two. Move to a shared store before scaling out. |
| `VOICE_STACK` | Production was moved to `realtime` on 2026-08-16 chasing latency, against the recommendation in `STATUS.md`, and the first test call truncated mid-sentence. Decide this on measurement, not preference. |
| `app/web/types/` | Generated `.d.ts`, gitignored. Never hand-edit. |
| Voice previews | 32 kbps AAC `.m4a` in `app/web/public/voices/`. Keep the format — the WAVs were 4.3 MB across the set. |
| `dograh/ui/public/embed/dograh-widget.js` | Still served at `/embed/dograh-widget.js` so snippets published before our widget existed keep working. Do not delete. |
| Vite env | Reads `VITE_*` from the **repo-root** `.env` (`envDir` in `vite.config.ts`), not from `app/web`. |

---

## 10. Secrets

`terraform/.ssh/id_ed25519` is the deployment key, and **one key grants root to
both the Harkbell and Dograh servers**. It exists only on the operator's
machine. Never commit it, never rsync it to a server, never paste it anywhere.
The same applies to `terraform/*.tfstate`, the root `.env`, `.secrets`, and
`deploy/hetzner/*/.env`.

Every deploy rsync must carry:

```
--exclude 'terraform/.ssh' --exclude 'terraform/*.tfstate*' --exclude '.env' --exclude 'deploy/hetzner/*/.env'
```

Provider keys (Gemini, Deepgram, OpenAI, ElevenLabs, Telnyx, Stripe, Resend)
belong in the server-side environment only. Never in a `VITE_*` variable, never
in a commit, never echoed into a log or a tracked file.

**`VITE_*` is a public bundle, not configuration.** Vite inlines those values
into JavaScript every visitor downloads, so a "build-time secret" is not a
secret. Exactly one exists — `VITE_API_BASE_URL`, a public URL — and that is the
number it should stay at.

**The Harkbell box's configuration comes from Infisical** (`/harkbell` @
`prod`), pulled by the deploy into that box's `.env`. Change a value there, not
on the box. The deploy pulls the whole folder, so a new key needs no workflow or
compose change — which is the point: `STRIPE_PRICE_STARTER` was once set in the
environment and never reached the container, because the production compose file
did not forward it and nothing failed. The Dograh box is still hand-managed.
See [`deploy/hetzner/README.md`](deploy/hetzner/README.md).

---

## 11. Where to read more

| Question | File |
|---|---|
| What is the product, in domain terms? | [`docs/01-overview.md`](docs/01-overview.md) |
| How do I run it? | [`docs/02-setup.md`](docs/02-setup.md) |
| How do the pieces fit together? | [`docs/03-architecture.md`](docs/03-architecture.md) |
| What is in the database? | [`docs/04-data-model.md`](docs/04-data-model.md) |
| What endpoints exist and who may call them? | [`docs/05-api-reference.md`](docs/05-api-reference.md) |
| How is the frontend organised? | [`docs/06-frontend.md`](docs/06-frontend.md) |
| How does a call actually work? | [`docs/07-voice-engine.md`](docs/07-voice-engine.md) |
| How do I deploy, and what do I do at 3am? | [`docs/08-operations.md`](docs/08-operations.md) |
| How do I verify a change? | [`docs/09-testing.md`](docs/09-testing.md) |
| How do I write code that fits? | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| What is built and what is not? | [`STATUS.md`](STATUS.md) |

## 12. Skills

`.claude/skills/` holds the repo-local skills. They encode the checklists above
for the recurring jobs — load the matching one before starting that kind of work.

| Skill | Use it when |
|---|---|
| `api-endpoint` | Touching `app/api/src/**/routes.ts` — a new route, a changed shape, a permission, an error code |
| `db-migration` | Touching `db/schema.ts` or `drizzle/` |
| `agent-workflow` | Touching `dograh/**`, `platform/**`, `verticals.ts` or `voices.ts` — what the agent says or does |
| `web-route` | Anything under `app/web/src`, including the widget |
| `verify-change` | Before finishing anything that touched a route, the worker, the engine, or a page |
| `release` | Deploying, preparing for launch, or diagnosing a production problem |
| `impeccable` | Design and UI craft work |

Claude Code is the only agent this repo targets. `.claude/` is the single home
for skills and shared settings; `AGENTS.md` is a pointer to this file and
nothing more. Do not create a second copy of any of this for another tool —
that is exactly how the previous documentation drifted out of date.
