# Vocalonix — Product Status & Roadmap

_Last updated: 2026-08-16_

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

> **Production currently contradicts this section.** `VOICE_STACK=realtime` was
> set on the Vocalonix box on 2026-08-16 to chase response latency, putting
> production back on Gemini Live — the stack this document identifies below as
> the top launch blocker. The first test call after the change showed the agent
> truncated mid-sentence ("Is there anything") and the caller asking "Huh?",
> which is consistent with the transcript problems described below. Either
> re-qualify that stack with measurements or revert to `VOICE_STACK=auto`;
> do not leave the decision resting on an unmeasured latency hunch.

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
- **Phone numbers.** A workspace searches our Telnyx inventory, buys a number on
  the platform account (one per business), and inbound calls route to that
  business's agent and follow it when the workflow is rebuilt. Buying, binding
  the number to the call control application, and registering the routing record
  are three separate steps; all three are verified on purchase and re-asserted at
  boot, because a gap in any one of them produces a number that bills monthly and
  never rings.
- **Outbound calling.** A callback task with a dialable number can be rung by the
  agent, from that business's own number. Tasks report whether they can be
  dialled at all, since a callback may legitimately hold an email address.
- **Widget.** Vocalonix-owned, shadow-DOM isolated, with a call panel, live
  status and level meter, mute, keyboard and screen-reader support, mobile
  layout, and host-page theme matching.
- **Try your agent.** Owners can call their own published agent from the
  dashboard before customers do.
- Signup/login, sessions, workspaces, roles, invitations, audit logs.
- Knowledge uploads synced to the engine through an outbox worker with retry and
  stuck-event recovery.
- Bookings with clash detection, callbacks, conversations with transcripts,
  contacts, knowledge gaps.
- Docker Compose runtime, health endpoints, 99 unit tests, clean typecheck.

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

- [ ] **Integration tests** covering API routes end to end. All 15 test files are
      unit-level; not one exercises an HTTP route. This is the gap that let a
      bought number reach production unable to receive a call — every individual
      unit passed, and nothing tested the path they form. Highest priority.
- [ ] **Notifications have no backend at all.** `notifications.tsx` is 305 lines
      of local `useState` with zero API calls, no endpoints and no tables. The
      inbox and the preference matrix are both mockups: nothing persists, and
      nothing is ever sent. Treat the page as a design prototype, not a feature.
- [ ] **Billing cannot charge anyone.** `billing/routes.ts` is 103 lines that
      create a Stripe customer and open the portal. There are no products,
      prices, subscriptions, checkout or plan gating, so the portal opens empty.
      Call duration *is* recorded (`durationSeconds`), but nothing aggregates or
      bills it.
- [ ] **Held slots and a waitlist** on bookings.
- [ ] Rate limiting is in-memory only; move to a shared store when the API
      scales past one instance.
- [ ] Retire the legacy single-workflow path in `dograh/workflow.ts` and its
      `/api/agent*` endpoints.

## Next, in order

1. **Integration tests over the HTTP routes.** Not the most interesting item,
   but it is first on evidence: the telephony break was invisible to a green
   test suite, a clean typecheck and a successful deploy.
2. **Decide the voice stack on measurement, not preference** — see the warning
   above. Production is currently on the stack this document calls the top
   launch blocker.
3. **Billing that can take money** — products, prices, checkout and plan gating,
   then meter the `durationSeconds` already being recorded.
4. **Notifications for real** — tables, endpoints and delivery behind the
   existing page, or remove the page until they exist.
5. **Calendar sync** (Google/Outlook) so bookings land where staff already look.
6. **SMS confirmations** for bookings and callbacks, over the same Telnyx key.

## How to run

```bash
git submodule update --init --depth 1
./scripts/setup.sh
docker compose up -d --build --wait
# Web http://localhost:3000 · API http://localhost:3001 · Engine http://localhost:3010
```

Checks: `bun install --frozen-lockfile && bun run typecheck && bun run test`.
