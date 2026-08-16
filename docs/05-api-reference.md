# API reference

Base path `/api`, served by Elysia from `app/api/src/index.ts`. Local:
`http://localhost:3001`.

**Errors** are always `{ error: string, code?: string }`. `error` is a full
sentence written for a human and safe to show unedited; `code` is a stable
`SCREAMING_SNAKE` identifier the client may branch on. Status mapping is in
[Architecture → Request lifecycle](03-architecture.md#request-lifecycle).

**Auth column** in the tables below:

| Marker | Meaning |
|---|---|
| — | Public |
| 🍪 | Signed-in session (`vocalonix_session` cookie) |
| 🏢 | Session **and** active membership of `:slug`, via `requireWorkspace`. Non-members get `404 WORKSPACE_NOT_FOUND` |
| 🔑 | `x-vocalonix-agent-key` header — the engine, mid-call |
| ✍️ | Stripe webhook signature |

**Permission** is the entry from the matrix in `workspace/permissions.ts`
checked by `requirePermission`. Where blank on a 🏢 route, membership at any
role is enough.

**List endpoints** take `?limit=&offset=` through `parseListQuery`
(`app/api/src/pagination.ts`).

---

## Health and platform

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/health` | — | `{ status, service, time }`. What the container healthcheck and the deploy verification hit |
| GET | `/api/dograh/health` | — | `{ connected, turnEnabled, health }`. `turnEnabled` gates the whole demo funnel in the UI |
| GET | `/api/verticals` | — | The trade catalogue: intake fields, defaults, suggested scripts |
| GET | `/api/platform/voices` | — | The voice catalogue with preview filenames |
| GET | `/api/platform/status` | 🍪 | The readiness panel: `callsReady` plus a check per subsystem (engine, WebRTC, speech, telephony, email, insights), each naming the env var that fixes it |
| POST | `/api/platform/recheck` | 🍪 | Force a provider reconciliation and re-report |
| GET | `/api/dograh/status` | 🍪 | Legacy — engine health plus the single legacy workflow |

## Authentication

Prefix `/api/auth`. better-auth's own routes are mounted internally at
`/api/auth/internal` and are not called directly by the frontend.

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/signup` | — | `{ name, email, password, returnTo? }`. 10/min per IP. Returns `verificationPreviewUrl` outside production |
| POST | `/api/auth/login` | — | `{ email, password, rememberMe? }`. 20/min per IP |
| POST | `/api/auth/magic/request` | — | 10/min per IP, plus better-auth's own 3/min |
| POST | `/api/auth/magic/consume` | — | Exchanges the token for a session |
| POST | `/api/auth/email/verify` | — | |
| GET | `/api/auth/session` | 🍪 | Current user and session, or `null` |
| POST | `/api/auth/refresh` | 🍪 | |
| POST | `/api/auth/logout` | 🍪 | |
| POST | `/api/auth/logout-all` | 🍪 | Revokes every session row for the user |
| GET | `/api/auth/sessions` | 🍪 | The session list behind `/account`, flagging the current one |

`returnTo` and `redirect` values pass through `safeReturnTo()`, which accepts
only same-origin paths.

## Workspaces, team and invitations

| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| GET | `/api/businesses` | 🍪 | | Also returns `workspaceLimit` and `canCreateWorkspace` |
| POST | `/api/businesses` | 🍪 | | Capped by `MAX_OWNED_WORKSPACES`. Creates the membership, agent settings, onboarding and Dograh mapping rows |
| GET | `/api/b/:slug` | 🏢 | | |
| DELETE | `/api/b/:slug` | 🏢 | `business.delete` | Soft delete; enqueues `dograh.business.offboard` |
| GET | `/api/b/:slug/team` | 🏢 | `team.manage` | Members and pending invitations |
| POST | `/api/b/:slug/invitations` | 🏢 | `team.manage` | Seat-limited by plan |
| POST | `/api/b/:slug/invitations/:invitationId/resend` | 🏢 | `team.manage` | |
| POST | `/api/b/:slug/invitations/:invitationId/revoke` | 🏢 | `team.manage` | |
| PATCH | `/api/b/:slug/team/:userId` | 🏢 | `team.manage` | Also gated by `canManageRole`; cannot leave a workspace ownerless |
| DELETE | `/api/b/:slug/team/:userId` | 🏢 | `team.manage` | Revokes rather than deletes the membership |
| GET | `/api/invitations/:token` | — | | Preview for the acceptance page |
| POST | `/api/invitations/:token/accept` | 🍪 | | Bound to the invited email address |

## Agent configuration and publishing

| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| GET | `/api/b/:slug/settings` | 🏢 | | Everything the settings screens render |
| PUT | `/api/b/:slug/settings/profile` | 🏢 | `agent.edit` | Name, city, country, timezone, vertical, contact email |
| PUT | `/api/b/:slug/settings/agent` | 🏢 | `agent.edit` | Persona, voice, prompts, interruption, transfer number |
| PUT | `/api/b/:slug/settings/hours` | 🏢 | `agent.edit` | |
| PUT | `/api/b/:slug/settings/widget` | 🏢 | `agent.edit` | Button text, colour, allowed domains |
| GET | `/api/b/:slug/settings/versions` | 🏢 | | Published history |
| POST | `/api/b/:slug/publish` | 🏢 | `agent.edit` | Writes a config version, enqueues sync + widget publish |
| GET | `/api/b/:slug/widget` | 🏢 | | Embed snippet and script URL for this business |
| GET | `/api/b/:slug/dograh` | 🏢 | | Sync state, last error, hashes |
| POST | `/api/b/:slug/dograh/retry` | 🏢 | `agent.edit` | Clears a `rejected`/`failed` state and re-enqueues |
| POST | `/api/b/:slug/onboarding/knowledge/complete` | 🏢 | `knowledge.manage` | Marks the wizard step done |

Mutations write to Postgres and enqueue an outbox event. The response is "saved,
pending" — the engine has not been called yet. See
[the outbox](03-architecture.md#the-outbox).

## Knowledge

| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| GET | `/api/b/:slug/knowledge` | 🏢 | | Paginated |
| POST | `/api/b/:slug/knowledge` | 🏢 | `knowledge.manage` | Multipart. ≤10 MB, extension allow-list **and** magic-byte check (`uploads.ts`) |
| DELETE | `/api/b/:slug/knowledge/:knowledgeId` | 🏢 | `knowledge.manage` | Soft delete, then `dograh.knowledge.delete` |
| GET | `/api/b/:slug/knowledge-gaps` | 🏢 | | |
| PATCH | `/api/b/:slug/knowledge-gaps/:gapId` | 🏢 | `knowledge.manage` | Answer or dismiss |

## Calls and dashboard

| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| GET | `/api/b/:slug/dashboard` | 🏢 | | Aggregates from `call_records` over a real window |
| GET | `/api/b/:slug/overview` | 🏢 | | Setup completeness and headline counts |
| GET | `/api/b/:slug/conversations` | 🏢 | | Paginated, filterable |
| GET | `/api/b/:slug/conversations/:runId` | 🏢 | | Transcript and recording, fetched from the engine on demand |

## Contacts, bookings, callbacks

| Method | Path | Auth | Permission |
|---|---|---|---|
| GET | `/api/b/:slug/contacts` | 🏢 | |
| POST | `/api/b/:slug/contacts` | 🏢 | `contacts.manage` |
| POST | `/api/b/:slug/contacts/import` | 🏢 | `contacts.manage` |
| PATCH | `/api/b/:slug/contacts/:contactId` | 🏢 | `contacts.manage` |
| DELETE | `/api/b/:slug/contacts/:contactId` | 🏢 | `contacts.manage` |
| GET | `/api/b/:slug/contacts/:contactId/activity` | 🏢 | |
| GET | `/api/b/:slug/bookings` | 🏢 | |
| POST | `/api/b/:slug/bookings` | 🏢 | `bookings.manage` |
| PATCH | `/api/b/:slug/bookings/:bookingId` | 🏢 | `bookings.manage` |
| POST | `/api/b/:slug/booking-resources` | 🏢 | `bookings.configure` |
| PATCH | `/api/b/:slug/booking-resources/:resourceId` | 🏢 | `bookings.configure` |
| POST | `/api/b/:slug/booking-services` | 🏢 | `bookings.configure` |
| PATCH | `/api/b/:slug/booking-services/:serviceId` | 🏢 | `bookings.configure` |
| GET | `/api/b/:slug/callbacks` | 🏢 | |
| POST | `/api/b/:slug/callbacks` | 🏢 | `callbacks.manage` |
| PATCH | `/api/b/:slug/callbacks/:callbackId` | 🏢 | `callbacks.manage` |
| POST | `/api/b/:slug/callbacks/:callbackId/call` | 🏢 | `callbacks.manage` |

`callbacks/:id/call` places a real outbound call from the business's own number.
A callback may legitimately hold only an email address, so the response says
whether it is dialable at all.

## Phone numbers

| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| GET | `/api/b/:slug/phone` | 🏢 | | Numbers this business holds |
| GET | `/api/b/:slug/phone/available` | 🏢 | | Search the Telnyx inventory |
| POST | `/api/b/:slug/phone` | 🏢 | `agent.edit` | Buy, bind and route. Plan-limited |
| GET | `/api/b/:slug/phone/pool` | 🏢 | | Numbers the platform already owns, including release history |
| POST | `/api/b/:slug/phone/:phoneNumberId/release` | 🏢 | `agent.edit` | Keeps the number on the platform account rather than handing it back to the carrier |

## Billing

| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| GET | `/api/b/:slug/billing` | 🏢 | `billing.access` | Effective plan, status, period end, usage, purchasable plans |
| POST | `/api/b/:slug/billing/checkout` | 🏢 | `billing.access` | `{ planId }` → a Stripe Checkout URL |
| POST | `/api/b/:slug/billing/portal` | 🏢 | `billing.access` | Stripe billing portal URL |
| POST | `/api/billing/webhook` | ✍️ | | `customer.subscription.created/updated/deleted` |

The webhook verifies the `stripe-signature` HMAC with `timingSafeEqual` and a
300-second tolerance, and **refuses every delivery when `STRIPE_WEBHOOK_SECRET`
is unset** — an unverified webhook would grant a paid plan to anyone who can
POST to a public URL. A deleted subscription drops the workspace to Free.

Usage is minutes summed from `call_records.duration_seconds` over the current
Stripe period, or a rolling 30 days when there is no subscription.

## Agent tools — the engine calling us

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/agent-tools/:businessId/availability` | 🔑 | Open slots for a date and service |
| POST | `/api/agent-tools/:businessId/book` | 🔑 | Creates a real `bookings` row with clash detection |
| POST | `/api/agent-tools/:businessId/message` | 🔑 | Creates a real `callback_tasks` row mid-call |

No session, no CSRF, no tenancy check beyond `:businessId` — the shared secret
*is* the authorisation. The URL the engine calls is
`VOCALONIX_INTERNAL_URL`, and it is part of the config hash, so moving the API
re-registers every agent. Details in [Voice engine](07-voice-engine.md#agent-tools).

## Demo funnel

Public, no signup, rate limited to 10 sessions/min per IP.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/demo/sessions` | Starts a session for a chosen vertical |
| PATCH | `/api/demo/sessions/:id` | Intake answers, contact details, voice |
| POST | `/api/demo/sessions/:id/start` | Provisions a throwaway workflow, returns embed details |
| POST | `/api/demo/sessions/:id/end` | Duration, transcript, cost |
| POST | `/api/demo/sessions/:id/feedback` | Score, chips, free text |

A score of 4–5 redirects to `/signup` carrying the demo answers so onboarding
starts pre-filled.

## Legacy — do not extend

Predates multi-tenancy. Session-guarded but **not** tenant-scoped: they operate
on one global workflow through `dograh/workflow.ts`. Slated for removal.

| Method | Path |
|---|---|
| GET / PUT | `/api/agent` |
| GET | `/api/agent/widget` |
| GET / POST | `/api/knowledge` |
| DELETE | `/api/knowledge/:documentUuid` |
| GET | `/api/dograh/status` |

New work uses `/api/b/:slug/*`.
