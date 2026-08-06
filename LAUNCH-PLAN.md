# Vocalonix — Launch Plan

A page-by-page assessment of the current product and a detailed plan to take it
from today's state to a launchable product, including the external integrations
required. Based on a full codebase review and a hands-on UI test pass of every
page and option (2026-08-05).

---

## 1. Where the product stands today

### Working end-to-end (real backend, production-quality logic)

| Area | Routes | Status |
| --- | --- | --- |
| Accounts & auth | `/signup`, `/login`, `/magic`, `/verify-email`, `/account`, `/account/security` | Password + magic-link auth, HTTP-only cookie sessions, session list, logout everywhere. Magic links return local preview URLs (no real email yet). |
| Workspaces | `/app`, `/app/onboarding/create`, `/app/:slug/*` | Real multi-tenant businesses, one Dograh workflow per business, slug routing, workspace switching. |
| Team & invitations | `/app/:slug/team`, `/invite/:token` | Roles (Owner→Viewer), invitations with resend/revoke, email-bound acceptance, reactivation of revoked members, audit logs. Server-enforced permission matrix. |
| Configuration | `/app/:slug/settings/{business,agent,hours,widget,appearance,history}` | Draft → "Changes pending" → Publish with diff view; versions persisted in `business_config_versions`; History restore-to-draft. |
| Knowledge — Sources & Answers | `/app/:slug/settings/knowledge` | Upload → MinIO → Dograh processing → workflow attach, delete/replace lifecycle via the outbox worker. |
| Dograh sync engine | server-side | Deterministic config hashing, sync leases, workflow-ownership guards, outbox retry with backoff, failure classification. |
| Browser-call widget | `/secret/test-agent`, `/embed/dograh-widget.js` | Real WebRTC calls via embed tokens; snippet embeddable on third-party sites. |
| Conversations | `/app/:slug/conversations` | Real Dograh runs per workspace: list with dispositions/filters/pagination, transcript bubbles, playable recording (PR #25). |
| Dashboard call stats | `/app/:slug/dashboard` | Real calls answered / completed / minutes / avg-length, hourly chart (business timezone), outcome mix, latest-calls feed (PR #26). |
| Callbacks ("Promises to keep") | `/app/:slug/callbacks` | Real `callback_tasks` table: create, assign, re-time, attempt log, close/reopen, role-gated mutations (PR #28). |
| Contacts | `/app/:slug/contacts` | Real `contacts` table: add by hand, CSV import, tags, agent-readable notes, soft delete, role-gated mutations (PR #29). |
| MVP lab | `/secret/*` | Session-protected single-workflow test surface (to be retired). |

### Design previews only (UI built, sample data, no backend)

Each of these pages currently shows a "Design preview" banner:

| Area | Route | Missing backend |
| --- | --- | --- |
| ~~Dashboard (callbacks / gaps / diary surfaces)~~ | `/app/:slug/dashboard` | Done: callback queue, knowledge gaps and today's diary are fed from their real backends; call stats live since PR #26. |
| ~~Bookings~~ | `/app/:slug/bookings` | Done in PR #35: booking/resource/service tables, CRUD API, clash guard, diary + Setup UI. Remaining: agent booking tools, slot holds, waitlist. |
| Notifications | `/app/:slug/notifications` | Per-person event × Email/SMS/Push matrix, quiet hours, delivery. |
| ~~Knowledge — Gaps~~ | `/app/:slug/settings/knowledge#gaps` | Done in PR #34: gaps mined from call transcripts, answer/dismiss workflow. |
| Billing | `/app/:slug/account` | Plans, payment method, metered minutes, invoices. |

### Structural gaps

- **No telephony.** The landing page promises a "real phone number", but only
  browser (WebRTC widget) calls exist. No inbound PSTN number, no SIP trunk.
- **No real email delivery.** Resend integration is coded but unverified;
  magic links / verification / invites only show local preview URLs.
- **No payments.** Billing is entirely sample data.
- **Legacy `/secret/*` lab** duplicates the tenant path (now requires a
  signed-in session; still not tenant-scoped).
- **BYO provider keys in Dograh UI.** AI model keys (Gemini/OpenAI) are
  configured by hand in the Dograh dashboard, not provisioned per tenant.
- **Escalation chain / night chain, human handoff** exist in designs
  (`docs/design/`) but have no implementation.
- **Spoken-call recognition is unreliable** (Gemini Live only intermittently
  transcribes caller speech — see §2); the core voice loop must be reliable
  before launch.

---

## 2. UI test findings (this pass)

_See the attached test report / recording for full detail; summary:_

**Passing** (every flow exercised in the running Compose stack):

- Public landing and design system (dropdown keyboard/Escape/outside-click,
  modal focus trap, backdrop close, focus restore).
- Signup, cookie session restore, session list, log-out-everywhere, redirect
  preservation; magic-link preview, single consumption, "already used" and
  "invalid link" states.
- Two-workspace onboarding, Dograh workflow publish, workspace switching with
  route-tail preservation.
- Team: sole-owner protection, invite/duplicate/resend/token rotation,
  email-mismatch and used-token states, Viewer downgrade with `/team` denial,
  revoke + Staff reinvite reactivation, escalation/nights toggles.
- Configuration: all six tabs, draft save → "Changes pending" → diff →
  Republish (version rows persisted), History restore-to-draft.
- Knowledge Answers/Gaps hash tabs; "Rewrite it" → pending → worker
  consolidation.
- `/secret/*` navigation, refresh, back/forward, 404 recovery; embed widget
  script serves `window.DograhWidget`.

**Failing / blocking**:

- **Spoken call: caller speech recognition is unreliable.** Client audio is
  verified good (mic audio reaches Chrome, is stored in Dograh's run
  recording, and instrumented logs confirm 16 kHz PCM streams continuously to
  Gemini Live). Yet Gemini (`gemini-3.1-flash-live-preview`) only
  intermittently emits `input_transcription` / user turns — in controlled
  tests only ~1 of 3 clearly spoken questions was recognized and answered.
  Misses correlate with the agent speaking or having just spoken (the
  default 10 s user-idle prompt "Are you still there?" keeps colliding with
  user turns), and some earlier runs failed entirely with
  `Gemini Live connection failed after 3 consecutive attempts: 1008`.
  Runs then end as `user_idle_max_duration_exceeded`. The remaining gap is
  in the upstream Dograh/Gemini Live layer (server-side VAD / barge-in
  handling and connection stability), not in Vocalonix's audio pipeline.
  This is the **top launch blocker** — interruption behavior and voice
  knowledge Q&A are unverifiable until it is reliable.
- ~~Minor bug: on Bookings, the "Callback queue for these ↗" and
  "All conversations ↗" links navigate to bare `/app` instead of the target
  pages.~~ Fixed in PR #21.

**Untested**: expired magic link and expired invitation states (require DB
time manipulation); real email delivery.

---

## 3. Plan to launch

Phases are ordered so that each one produces a shippable increment. Estimates
assume 1–2 engineers.

### Phase A — Make real data flow (the product's core loop)

> Goal: a business signs up, publishes its agent, and sees real calls,
> transcripts, gaps, and callbacks in the dashboard.

1. ~~**Conversations backend**~~ — done in PR #25: workspace-scoped
   `/api/b/:slug/conversations` endpoints read runs (transcript, recording,
   duration, disposition) straight from Dograh; the Conversations UI is wired
   to them. (A local `calls` schema/webhook ingest remains a later
   optimization.)
2. **Knowledge Gaps backend** — extract unanswered questions from transcripts
   (LLM classification pass in the worker); feed the Gaps tab; "Answer it"
   writes back into knowledge Sources/Answers.
3. ~~**Callbacks backend**~~ — done in PR #28: `callback_tasks` table with
   assignment, promise-time buckets, attempt logging and done states; the
   existing UI is wired to it. Auto-creation from calls is done in
   PR #31/#32: the worker polls completed runs and creates "FROM A CALL"
   tasks when the caller asked for a callback.
4. ~~**Contacts backend**~~ — done in PR #29: `contacts` table with CSV
   import, tags and per-contact agent notes. Auto-creation from calls is
   done in PR #31/#32: caller details come from Dograh's in-call extraction
   when present, otherwise from a Gemini pass over the persisted transcript
   (`GEMINI_API_KEY`). Remaining: call-history linkage on the contact page.
5. **Real Dashboard** — partially done in PR #26: call stats, hourly chart,
   outcome mix and latest-calls feed are live from Dograh runs. Remaining:
   callback queue, knowledge-gap and diary surfaces once those backends land.

### Phase B — Bookings (the headline feature for service businesses)

1. ~~Drizzle tables~~ — done in PR #35: `booking_resources`, `booking_services`,
   `bookings` (holds/waitlist still to come).
2. ~~CRUD API + diary UI wiring~~ — done in PR #35: hour grid from real data,
   nudge/reassign moves, arrived/no-show/cancel, Setup CRUD, clash guard.
3. **Agent booking tools in Dograh**: function-calling tools so Robin can
   check availability, hold a slot during the call, confirm, and read back.
4. Held-slot expiry + double-booking guards.
5. (Post-launch option) two-way calendar sync — see integrations.

### Phase C — Telephony (a real phone number)

1. Integrate a telephony provider (see §4) with Dograh's SIP/PSTN path:
   number provisioning per business, inbound routing to the business's
   workflow, call recording consent handling.
2. Number purchase/port UI in Configuration.
3. Outbound: callback tasks get a "call back now" action; SMS confirmations
   for bookings.
4. Escalation chain: warm transfer to staff phones, night-chain rota,
   voicemail fallback.

### Phase D — Monetisation & production hardening

1. **Billing**: Stripe subscriptions + metered call minutes; plan gating;
   invoices; wire the existing Billing UI. Owner-only, already permission-gated.
2. **Email**: verify Resend in production (domain, DKIM), real magic-link /
   verification / invitation emails; `REQUIRE_EMAIL_VERIFICATION=true`.
3. **Notifications backend**: event bus → Email (Resend), SMS (telephony
   provider), Web Push; quiet hours; wire the existing matrix UI.
4. **Retire `/secret/*`** (or gate behind an internal admin flag) and the
   legacy single-workflow path in `dograh/workflow.ts`.
5. Production deployment: HTTPS everywhere, secure cookies, `env.ts`
   production refinements verified, secrets management, backups for Postgres
   + MinIO, monitoring/alerting (Sentry + uptime), rate limiting on auth and
   widget-token endpoints.
6. Provider key management: move Gemini/OpenAI keys out of manual Dograh UI
   setup into server-provisioned configuration (platform keys with usage
   metering, or per-tenant BYOK stored server-side).

### Phase E — Polish & mobile

1. Empty/first-run/offline/integration-error states everywhere
   (`Vocalonix Empty States.dc.html`); shared `EmptyState` component.
2. Mobile responsive pass per `Vocalonix Mobile.dc.html` (four-tab bar,
   time-down diary list) as breakpoints on the same routes.
3. Onboarding flow completion (`/app/:slug/onboarding/:step`) so a new
   business reaches a published agent in one guided pass.
4. Landing page: align promises with shipped features; pricing page.

---

## 4. Integrations needed

| Integration | Purpose | Phase | Notes |
| --- | --- | --- | --- |
| **Resend** (already coded) | Magic links, verification, invitations, notification email | D (verify now) | Needs production key + domain/DKIM verification. |
| **Twilio** (or Telnyx/Vonage) | Phone numbers, inbound PSTN → Dograh, SMS, warm transfer | C | Pick based on Dograh's SIP support; Telnyx is cheaper at volume, Twilio fastest to integrate. |
| **Stripe** | Subscriptions + metered minutes, invoices, customer portal | D | Stripe Billing with usage records maps directly to call minutes. |
| **Google AI Studio (Gemini)** | Realtime STS + conversation LLM (already used via Dograh BYOK) | now | Move to server-provisioned keys with usage metering. |
| **OpenAI** | Embeddings for knowledge retrieval (already used via Dograh) | now | Same key-management work. |
| **Google Calendar / Outlook (Microsoft Graph)** | Two-way booking sync for businesses with existing calendars | post-launch | Bookings work standalone first; sync is an upgrade. |
| **Sentry + uptime monitoring** | Error tracking API/web/worker, alerting | D | Low effort, high value before real customers. |
| **S3-compatible object storage** (prod MinIO or AWS S3/R2) | Knowledge files, call recordings | D | Already MinIO locally; choose managed storage for prod. |
| **Web Push (VAPID) / FCM** | Push channel of the notifications matrix | D | Optional at launch; email+SMS may be enough initially. |

Explicitly **not** needed for launch: CRM integrations, Zapier, WhatsApp —
defer until customer pull.

---

## 5. Suggested launch checklist

- [ ] Phase A complete: real conversations, gaps, callbacks, contacts, dashboard
- [ ] Phase B complete: bookings diary + agent booking tools
- [ ] Phase C complete: at least one business answering a real phone number
- [ ] Stripe billing live with at least one paid plan
- [ ] Resend verified; email verification enforced
- [ ] `/secret/*` retired or admin-gated
- [ ] Production infra: HTTPS, backups, monitoring, rate limits
- [ ] Legal: recording-consent handling per target market, privacy policy, DPA
- [ ] Onboarding gets a new business to a live agent in < 15 minutes
