# Vocalonix — Product Status & Roadmap

_Last updated: 2026-08-14_

## What the product is

Multi-tenant AI voice-agent platform. Businesses sign up, configure a voice
agent (persona, hours, services, knowledge base), and publish an embeddable
voice widget. Calls run on the bundled [Dograh](dograh/) engine (WebRTC +
Gemini realtime voice), and call outcomes feed bookings, callbacks,
conversations, and notifications.

## What works today

- Signup / login (magic link; local preview links in dev), sessions, onboarding.
- Workspaces with memberships, roles (Owner/Manager/Staff), and invitations.
- Agent configuration with draft → publish lifecycle and version history.
- Knowledge base uploads (PDF/DOC/DOCX/TXT/JSON) synced to Dograh via an
  outbox worker with retry/backoff and stuck-event recovery.
- Embeddable voice widget with embed tokens; public demo agent under `/secret/*`.
- Bookings with clash detection, callbacks generated from call extractions,
  conversations with transcripts, and in-app notifications.
- Docker Compose runtime (`./scripts/setup.sh && docker compose up -d --build --wait`),
  API health + Dograh status endpoints, 50 passing unit tests, clean typecheck.

## What we need (external inputs)

- **AI provider keys**: Gemini (realtime voice) and OpenAI (embeddings) keys
  must be configured for real calls; without them only UI flows work.
- **Telephony**: no PSTN integration yet — the widget is browser-only. Twilio
  (or similar) is needed for real inbound/outbound phone calls.
- **Email delivery**: magic links only print preview URLs locally; a real
  SMTP/ESP integration is required for production signups.
- **Billing**: no plans/limits/payment integration.
- **Production hardening**: monitoring/alerting, backups, rate limiting on
  public endpoints.

## What is left (known issues / backlog)

Fixed in the current branch:

- [x] Secret lab workflow lookup could collide with tenant workflows
      (`[Vocalonix]` vs `[Vocalonix:<id>]` prefixes).
- [x] Inconsistent upload size limits (5 MB vs 10 MB) — centralized at 10 MB.
- [x] Uploads validated by filename only — now also checked against file
      content signatures (magic bytes / binary sniffing).
- [x] Dograh error details could leak internal payloads to clients — now
      logged server-side, generic message returned.
- [x] Last-owner check ran outside the transaction (race could leave a
      workspace with zero owners) — now locked inside the transaction.
- [x] Worker ignored SIGTERM/SIGINT — now finishes the current event and
      exits cleanly.
- [x] Many internal links used `<a href>` / `window.location`, causing full
      page reloads — converted to typed SPA `Link`s.

Still open (rough priority order):

- [ ] **Pagination** for conversations, contacts, bookings, callbacks, and
      notifications — all lists load everything at once.
- [ ] **Integration tests** covering API routes end-to-end (auth, workspace,
      knowledge, outbox) — current tests are unit-level only.
- [ ] **Destructive-action confirmations** (delete knowledge doc, revoke
      member, offboard workspace) are inconsistent in the UI.
- [ ] **Worker healthcheck** — no liveness signal for the outbox worker in
      Docker Compose.
- [ ] Workspace switcher still uses `window.location.assign` (full reload).
- [ ] Email verification flow is disabled and untested.
- [ ] Rate limiting / abuse protection on public endpoints (signup, widget,
      demo agent).

## Product suggestions

1. **Telephony first** — a browser-only widget limits real-world use; Twilio
   inbound numbers would make it a complete receptionist product.
2. **Analytics dashboard** — call volume, booking conversion, missed-call
   recovery; this is the ROI story for buyers.
3. **Calendar integrations** (Google/Outlook) so bookings land on real
   calendars instead of the internal diary only.
4. **SMS follow-ups** for callbacks and booking confirmations.
5. **Usage-based billing** with per-plan call-minute limits once telephony
   lands.
6. **Agent testing sandbox** for tenants (the `/secret/test-agent` lab exists
   for operators; tenants should get a safe "try your agent" page too).

## How to run

```bash
git submodule update --init --depth 1
./scripts/setup.sh
docker compose up -d --build --wait
# Web http://localhost:3000 · API http://localhost:3001 · Dograh http://localhost:3010
```

Checks: `bun install --frozen-lockfile && bun run typecheck && bun run test`.
