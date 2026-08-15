# Vocalonix — Product Status & Roadmap

_Last updated: 2026-08-15_

## Start here: making calls work

The platform provisions the voice engine itself. Put keys in `.env`, restart the
API, and the dashboard's **Setup** panel reports what was accepted and what is
still missing — including the exact environment variable that fixes each gap.

```bash
./scripts/setup.sh                       # writes every key placeholder into .env
# edit .env, then:
docker compose up -d --build --wait
```

| What you want | What to paste |
| --- | --- |
| Calls working at all | `GEMINI_API_KEY` |
| Calls working *well* | `DEEPGRAM_API_KEY` + `OPENAI_API_KEY` |
| A real phone number | `TELNYX_API_KEY` |
| Real sign-in emails | `RESEND_API_KEY` + a verified sending domain |

**Use the pipeline stack for launch.** With `DEEPGRAM_API_KEY` present,
`VOICE_STACK=auto` runs Deepgram speech-to-text → an LLM → Deepgram speech-out.
The previous default was Gemini Live speech-to-speech, which only intermittently
emitted the caller's words and was the top launch blocker: transcripts arrived
late or not at all, so interruptions and knowledge answers could not be relied
on. A pipeline puts transcription on its own stream, and lets each business pick
its own voice.

Keys are validated on save. Deepgram, OpenAI and ElevenLabs keys are checked
against the real provider APIs and a rejection is shown verbatim in the setup
panel. Google keys are not checked by the engine, so Vocalonix verifies
`GEMINI_API_KEY` itself against the Generative Language API.

## What the product is

Multi-tenant AI receptionist. A business signs up, configures its agent
(persona, voice, hours, services, knowledge), and publishes. The same agent then
answers on the business's website through an embeddable widget and, once a
number is connected, on the phone. Calls feed bookings, callbacks,
conversations, contacts and knowledge gaps.

## What works today

- **Agent generation.** Each business gets a purpose-built workflow on the
  bundled [Dograh](dograh/) engine: a greeting that routes the call, a
  knowledge-grounded answering step, a booking step wired to the real diary, a
  handover step, a message-taking step, and separate endings for a finished call
  and a spam call. The global prompt carries live local time, the real opening
  hours, real services and prices, trade-specific rules, and hard limits on what
  the agent may claim. It is rebuilt whenever any of that changes.
- **Trade awareness.** Eleven trades, each with its own agent rules — what a
  dental agent must never advise on, what counts as an emergency for a vet, how
  a funeral home's agent should speak.
- **Voices.** Eight catalogue voices with previews, mapped per provider, applied
  as a per-workflow model override so two businesses on one platform sound
  different.
- **Tools the agent can actually use.** Live availability, booking, and message
  taking (which creates a real callback task mid-call), plus warm transfer on
  phone calls when a transfer number is set.
- **Phone numbers.** A workspace connects a number it owns in Telnyx; inbound
  calls route to that business's agent and follow it when the workflow is
  rebuilt.
- **Widget.** Vocalonix-owned, shadow-DOM isolated, with a call panel, live
  status and level meter, mute, keyboard and screen-reader support, mobile
  layout, and host-page theme matching.
- **Try your agent.** Owners can call their own published agent from the
  dashboard before customers do.
- Signup/login, sessions, workspaces, roles, invitations, audit logs.
- Knowledge uploads synced to the engine through an outbox worker with retry and
  stuck-event recovery.
- Bookings with clash detection, callbacks, conversations with transcripts,
  contacts, knowledge gaps, in-app notifications.
- Docker Compose runtime, health endpoints, 81 unit tests, clean typecheck.

## Deployment checklist (needs the operator)

- [ ] Speech keys in `.env` (see the table above) — the setup panel confirms.
- [ ] `TELNYX_API_KEY` if you want phone numbers, plus
      `TELNYX_WEBHOOK_PUBLIC_KEY` in production so webhooks are verified.
- [ ] Resend API key + verified sending domain (`RESEND_API_KEY`, `EMAIL_FROM`).
- [ ] `REQUIRE_EMAIL_VERIFICATION=true` in production.
- [ ] Unique production `AUTH_SECRET` (enforced at boot).
- [ ] HTTPS `API_PUBLIC_URL` / `APP_ORIGIN` (enforced at boot).
- [ ] Database backups + a tested restore path.
- [ ] Uptime monitoring on `/api/health` and the worker heartbeat.
- [ ] Run a single API instance (rate limiting is in-memory) or add a shared
      store before scaling out.

## What is left

- [ ] **Integration tests** covering API routes end to end. Current tests are
      unit-level; the telephony attach/route/release path and the provider
      reconciler were verified against the running stack by hand.
- [ ] **Outbound calling.** Callback tasks cannot yet dial out; the number is
      inbound-only.
- [ ] **Held slots and a waitlist** on bookings.
- [ ] **Notifications delivery.** The matrix UI exists; email/SMS/push sending
      does not.
- [ ] **Billing.** Stripe customer portal is wired; metered call minutes and
      plan gating are not.
- [ ] Rate limiting is in-memory only; move to a shared store when the API
      scales past one instance.
- [ ] Retire the legacy single-workflow path in `dograh/workflow.ts` and its
      `/api/agent*` endpoints.

## Next, in order

1. **Outbound calling** — a callback task that can be dialled turns the callback
   queue from a to-do list into the product doing the work.
2. **Calendar sync** (Google/Outlook) so bookings land where staff already look.
3. **Usage-based billing** on call minutes, now that minutes are metered.
4. **SMS confirmations** for bookings and callbacks, over the same Telnyx key.

## How to run

```bash
git submodule update --init --depth 1
./scripts/setup.sh
docker compose up -d --build --wait
# Web http://localhost:3000 · API http://localhost:3001 · Engine http://localhost:3010
```

Checks: `bun install --frozen-lockfile && bun run typecheck && bun run test`.
