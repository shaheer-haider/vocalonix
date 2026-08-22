# Harkbell — Product Status & Roadmap

_Last updated: 2026-08-22_

> This file answers **what is built and what is next**. For how any of it works,
> see [`docs/`](docs/README.md); for the rules of changing it, see
> [`CLAUDE.md`](CLAUDE.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md). Keep this
> file honest — it is the one document allowed to talk about the future, and a
> claim here that the code contradicts is a bug in this file.

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

> **Resolved on 2026-08-22.** `VOICE_STACK=realtime` had been set on
> 2026-08-16 to chase response latency, putting production back on Gemini Live —
> the stack this document identifies below as the top launch blocker. The first
> test call after that change showed the agent truncated mid-sentence ("Is there
> anything") and the caller asking "Huh?".
>
> Production was torn down and rebuilt on 2026-08-21/22, and the value came back
> as `auto` in Infisical `/be`. It stays there until somebody has latency
> measurements to justify moving it — the previous change rested on a hunch and
> cost a broken test call. **No call has yet been placed against the rebuilt
> stack**, so `auto` is the documented default here, not a measured result.

**Use the pipeline stack for launch.** With `DEEPGRAM_API_KEY` present,
`VOICE_STACK=auto` runs Deepgram speech-to-text → an LLM → Deepgram speech-out.
The previous default was Gemini Live speech-to-speech, which only intermittently
emitted the caller's words and was the top launch blocker: transcripts arrived
late or not at all, so interruptions and knowledge answers could not be relied
on. A pipeline puts transcription on its own stream, and lets each business pick
its own voice.

Keys are validated on save. Deepgram, OpenAI and ElevenLabs keys are checked
against the real provider APIs and a rejection is shown verbatim in the setup
panel. Google keys are not checked by the engine, so Harkbell verifies
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
- **Widget.** Harkbell-owned, shadow-DOM isolated, with a call panel, live
  status and level meter, mute, keyboard and screen-reader support, mobile
  layout, and host-page theme matching.
- **Try your agent.** Owners can call their own published agent from the
  dashboard before customers do.
- **Pricing that a visitor can actually see.** `/pricing` renders the plan
  catalogue from an unauthenticated `GET /api/plans`, and the landing page
  derives its price line from the same endpoint rather than repeating figures
  that would drift. A deployment with no Stripe price configured renders an
  honest page instead of a checkout button that fails.
- **A plan step in onboarding.** Setup is seven steps, and choosing a plan is
  the one before publishing — nobody builds an agent and first learns the price
  from a card statement. Free is a real choice there, not a way to skip.
- **Billing belongs to an account, not a business.** One subscription covers
  several businesses: Free and Essential include one, Pro includes three and
  sells further ones at $19 a month. Minutes pool across the account and
  suspension moves every business together, because they share one allowance.
  A business that may hold a number holds exactly one — how many is a product
  rule, so more numbers means more businesses; **whether** is a plan lever, and
  Free answers on the website only. That gate is also what makes warm transfer
  and outbound callbacks true of the paid plans, since both are refused without
  a live number. Seats are per business: 2 on Free, 10 on Essential, unlimited
  on Pro.
- **Nobody finds out their agent stopped answering by accident.** The worker
  emails the account owner at 80% of the plan's minutes and again when they are
  spent, and the billing panel warns at the same threshold. Before this the
  agent went silent with no warning of any kind, which contradicted the one
  thing the product promises.
- **A demo that starts in one click.** Picking a trade starts the call; contact
  details are asked for afterwards, when there is a reason to give them. The
  funnel used to ask nine fields across four screens before a visitor heard
  anything. Each live trade has one reusable published agent on the engine,
  reconciled at boot and skipped when its config hash is unchanged, so starting
  a demo is a row read (~25ms) rather than four calls to the engine — and the
  engine no longer collects a dead workflow per curious visitor.
- Signup/login, sessions, workspaces, roles, invitations, audit logs.
- Knowledge uploads synced to the engine through an outbox worker with retry and
  stuck-event recovery.
- Bookings with clash detection, callbacks, conversations with transcripts,
  contacts, knowledge gaps.
- Docker Compose runtime, health endpoints, 174 unit tests, clean typecheck.

## Deployment checklist (needs the operator)

> **Production was rebuilt from scratch on 2026-08-22** after the previous boxes
> were destroyed. Configuration now lives entirely in Infisical (`/be`, `/voice`,
> `/tls`) and both boxes are deployed by pipeline — nothing is edited on a
> server. The checklist below is kept as the definition of "configured"; the
> boxes currently satisfy every line except the three marked open.
>
> | | |
> |---|---|
> | App | `harkbell.com` → `2.29.14.150` (Cloudflare-proxied) |
> | Voice | `voice.harkbell.com` → `2.29.8.106` (DNS-only, Let's Encrypt) |
> | Engine | Dograh 1.41.0, `turn_enabled: true` |
> | Deploy | `deploy.yml` on push; `deploy-dograh.yml` manual only |

- [x] Speech keys — Gemini, Deepgram and OpenAI are set in Infisical `/be`.
- [x] `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_PRO` — `/api/plans` reports both
      paid plans `purchasable: true` against the live deployment. Without them
      `/pricing` and the onboarding plan step fall back to "Talk to us", which
      is honest but unbuyable. `./scripts/stripe-bootstrap.sh` regenerates them;
      run it with the key whose mode the server uses, because a test price id
      does not resolve against a live key — and the current keys are **test
      mode**, so going live means re-running it and replacing both ids.
- [x] `STRIPE_WEBHOOK_SECRET` — the endpoint did not exist at all until
      2026-08-22, so every subscription event was being dropped and a paid plan
      would never have been applied. Created against
      `https://harkbell.com/api/billing/webhook` for the three
      `customer.subscription.*` events the handler reads.
- [x] `TELNYX_API_KEY` and `TELNYX_CONNECTION_ID`.
      `TELNYX_WEBHOOK_PUBLIC_KEY` is deliberately unset — `platform/telephony.ts`
      derives it from the API key.
- [x] Resend key and `EMAIL_FROM`, `REQUIRE_EMAIL_VERIFICATION=true`, unique
      `AUTH_SECRET`, HTTPS origins — all enforced at boot and the box boots.
- [x] Database backups + a tested restore path. `harkbell-backup` dumps
      Postgres to Cloudflare R2 every 6 hours, keeps 14 days, verifies each
      archive with `pg_restore --list` before uploading, and prunes only after a
      successful upload. The restore was exercised on 2026-08-22: pulled back
      from R2, restored into a scratch database, 27 tables and 24 migration
      records intact, matching production.
- [x] Terms of Service and Privacy Policy, published at `/terms` and `/privacy`,
      linked from the footer of every public page and from the signup form at
      the point of agreement. Stripe asks for both before an account leaves test
      mode, and the product records call audio, transcripts and callers' contact
      details, which puts it squarely in GDPR/CCPA territory.

      **Needs the operator before live payments:** `OPERATOR` at the top of
      `app/web/src/routes/legal.tsx` holds the legal entity, registered address
      and governing law. All three are blank, and blank renders the document
      *without* those clauses rather than with invented ones — a wrong
      registered address is worse than a missing one. Have both documents read
      by a lawyer; they are written to be accurate about what the product
      actually does, which is not the same as being legal advice.
- [ ] **Open: `hello@harkbell.com` cannot receive mail.** `harkbell.com` has no
      MX record. Sending is fully set up — DKIM on `resend._domainkey`, SPF and
      a bounce MX on `send.harkbell.com`, DMARC at `p=none` — but nothing comes
      back the other way. That address is now the contact route on the pricing
      page, in the billing panel, in the footer of every public page, and in the
      "reply to this email" line the largest plan gets when it runs out of
      minutes. It is also the `rua=` target of our own DMARC reports. Until it
      has a mailbox, all of those bounce.

      Cloudflare Email Routing is free, the DNS is already there, and forwarding
      to a personal address takes about five minutes. It needs the operator:
      the destination address has to be confirmed from its own inbox.
- [ ] **Open:** uptime monitoring on `/api/health` and the worker heartbeat.
- [ ] **Open:** a real call against the rebuilt stack. Everything below the call
      itself is verified; the call is not.
- [x] Single API instance, so the in-memory rate limiter is still correct.

## What is left

- [ ] **Integration tests** covering API routes end to end. All 20 test files are
      unit-level; not one exercises an HTTP route. This is the gap that let a
      bought number reach production unable to receive a call — every individual
      unit passed, and nothing tested the path they form. Highest priority.
- [ ] **Notifications have no backend at all.** `notifications.tsx` is 305 lines
      of local `useState` with zero API calls, no endpoints and no tables. The
      inbox and the preference matrix are both mockups: nothing persists, and
      nothing is ever sent. Treat the page as a design prototype, not a feature.
- [ ] **Billing is not proven against real money.** Plans, Stripe Checkout, the
      signature-verified webhook, plan gating on seats and phone numbers, and
      usage metered from `call_records.durationSeconds` all landed in #68. What
      has *not* happened is an end-to-end run in Stripe test mode — checkout,
      webhook delivery, entitlement change, downgrade — and no test covers the
      webhook against a real payload. Treat billing as built but unverified
      until that pass is done and recorded.

      The included-minutes ceiling *is* now enforced. It could not be: the
      widget holds a long-lived embed token and talks to the engine directly,
      so nothing on the Harkbell side was in the path of a call, and
      `callMinutesExhausted()` was written but never called from anywhere — a
      free workspace could spend unlimited minutes. Enforcement is now
      suspension: the worker reconciles usage after each ingest pass and
      deactivates the embed token when a plan's minutes are spent, restoring it
      on upgrade or a new period. The ceiling is soft by at most the call in
      flight. Dograh reactivates the same token row, so a customer's published
      snippet keeps working across a suspension — see the note on
      `resumeBusinessCalls`.
- [ ] **Each business in its own Dograh organization.** The foundation landed:
      `dograh/tenantAccount.ts` derives per-business engine credentials from
      `AUTH_SECRET`, `tenantDograhClient()` returns a client scoped to that
      business, and `pushModelConfigurationTo()` puts the provider keys into a
      fresh organization. Isolation is verified against a running engine — a
      tenant client sees only its own workflows and gets a 404 on another's.
      **The sync path does not use it yet**, and two things have to be solved
      before it can:
      - *Telephony is per-organization too.* A workflow in a business's own
        organization cannot route through a telephony configuration in the
        platform organization, so each business needs its own — and Dograh
        creates a Telnyx call control application per configuration. This is
        the area that already shipped a number that billed and never rang, so
        it needs a Telnyx key and a real inbound call to verify, not a
        typecheck.
      - *Existing businesses' workflows live in the platform organization.*
        Flipping the client without moving them makes `getWorkflow` 404 and the
        sync state machine build duplicates. Needs a migration that recreates
        each workflow under its own organization and re-points its number.

      Until then knowledge stays tenant-safe because the generator pins
      `document_uuids` on every node that can retrieve, which is now asserted
      by `config.test.ts` rather than left to whoever adds the next node.
- [ ] **The founding offer has an end, and ending it takes a deliberate act.**
      `FOUNDING_OFFER` in `billing/plans.ts` promises the first 50 businesses
      Essential at $49 for as long as they stay, $99 after. Two things follow.

      Counting is manual: nothing tracks how many places are left, deliberately,
      because a live counter stuck at "50 of 50 remaining" advertises that
      nobody has bought yet. Check `select count(*) from billing_accounts where
      plan_name = 'starter' and plan_status in ('active','trialing')` before
      deciding it is over, then set `FOUNDING_OFFER` to null — one line, and
      every surface stops showing it.

      Raising the price means creating a **new** Stripe price and pointing
      `STRIPE_PRICE_STARTER` at it. Stripe holds each subscription on the price
      it was created with and a price's amount cannot be edited, so founding
      customers stay at $49 on their own. Do not migrate existing subscriptions
      onto the new price — that is the single action that breaks the promise.
- [ ] **Minute top-ups, and the hole between $49 and $149.** There is no way to
      buy more minutes — the only path past a spent allowance is moving up a
      plan. That leaves a single busy business needing 800 minutes with a choice
      between paying 3x for two businesses it cannot use and going quiet, and it
      is the reason the exhausted-minutes email has nothing better to offer than
      an upgrade. The original design had it (`docs/design/claude-export/
      Vocalonix Settings.dc.html` shows "300 minutes for £15, added to this
      cycle only"); it was never built. Needs a one-off Stripe price, a checkout
      flow and a credit column, so it is a feature rather than a copy fix.
- [ ] **Check the margin before the first real invoice.** Essential earns
      $0.098 per answered minute and Pro earns $0.075, so Pro has the *thinner*
      margin per minute. Whether that is comfortable depends entirely on
      whether `VOICE_STACK` resolves to `pipeline` (Deepgram Aura-2, cheap) or
      `realtime` (several times more). The readiness panel reports which; decide
      the price on that number rather than on the plan table looking tidy.
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
3. **Prove billing in Stripe test mode** — checkout, webhook delivery,
   entitlement change and downgrade, end to end, plus a test over the webhook
   handler. The code exists; the evidence does not.
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
