# Vocalonix Agent Notes

## Repository

Vocalonix is a web-first voice-agent product. It uses a self-hosted Dograh instance for voice orchestration.

## Tech stack

- **Backend**: Bun, Elysia, Drizzle ORM, better-auth, PostgreSQL.
- **Frontend**: React, Vite, TanStack Router, react-hook-form, zod.
- **Voice platform**: Dograh (git submodule at `dograh/`).
- **Build/test**: Bun workspaces (`app/api`, `app/web`).

## Common commands

```bash
# Install dependencies
bun install --frozen-lockfile

# Typecheck both workspaces
bun run typecheck

# Run API tests
bun run test

# Build the web app (outputs to app/web/dist)
bun run --cwd app/web build

# Run database migrations
bun run db:migrate

# Full local runtime with Docker
./scripts/setup.sh
docker compose up -d --build --wait
```

## Important paths

- Backend entry: `app/api/src/index.ts`
- Voice provider provisioning: `app/api/src/platform/voiceStack.ts`, `app/api/src/platform/providers.ts`
- Telephony (phone numbers): `app/api/src/platform/telephony.ts`
- Agent workflow generator: `app/api/src/dograh/config.ts`
- Agent tools the engine calls back into: `app/api/src/dograh/agent-tools.ts`, `app/api/src/agent/routes.ts`
- Voice catalogue: `app/api/src/voices.ts`
- Trade-specific agent rules: `app/api/src/verticals.ts` (`VERTICAL_AGENT_RULES`)
- Embeddable widget: `app/web/public/embed/vocalonix-widget.js`
- Worker entry: `app/api/src/worker.ts`
- Frontend entry: `app/web/src/main.tsx`
- Route definitions: `app/web/src/router.tsx`
- Demo route: `app/web/src/routes/demo.tsx`
- Demo API: `app/api/src/demo/*`
- Database schema: `app/api/src/db/schema.ts`
- Dograh integration: `app/api/src/dograh/*`
- Hetzner deploy guide: `deploy/hetzner/README.md`
- Infrastructure (OpenTofu): `terraform/`
- Deployment SSH key: `terraform/.ssh/id_ed25519`

## Deployment secrets

`terraform/.ssh/id_ed25519` is the OpenTofu-generated deployment key and **one
key grants root to both the Vocalonix and Dograh servers**. It lives only on the
operator's machine, gitignored via `terraform/.ssh/`. Never commit it, never
`rsync` it to a server, and never paste it into a file or log.

The same applies to `terraform/*.tfstate`, the root `.env`, and
`deploy/hetzner/*/.env`. Every deploy rsync must carry these excludes:

```bash
--exclude 'terraform/.ssh' --exclude 'terraform/*.tfstate*' \
--exclude '.env' --exclude 'deploy/hetzner/*/.env'
```

See `deploy/hetzner/README.md` for the full deploy and redeploy commands, an
audit snippet that finds stray copies on the servers, and the key-rotation steps.

## How calls are configured

The operator never opens the Dograh dashboard. `app/api/src/platform/providers.ts`
resolves a speech stack from the API keys in the environment and pushes it to
Dograh's organisation model configuration at API boot, then records the result
so `/api/platform/status` can report it. `VOICE_STACK=auto` prefers the pipeline
stack (Deepgram STT → LLM → Deepgram TTS) whenever the keys allow it, and falls
back to a realtime speech-to-speech model otherwise.

A business that picked a non-default voice also gets a per-workflow
`model_configuration_v2_override`, which is how two tenants on one platform end
up sounding different. Businesses on the default voice inherit the organisation
configuration, so the common case costs no extra provider validation.

`app/api/src/dograh/config.ts` builds each tenant's workflow. The graph is
deliberate — greeting → answer / book / hand over → message → close, with a
separate early ending for spam — and the prompts follow Dograh's own voice
prompting guide (`dograh/api/services/voice_prompting_guide/`). Bump
`TENANT_CONFIG_VERSION` whenever the graph changes shape; every business
re-syncs on the next deploy because the version is part of the config hash.

## Widget

`app/web/public/embed/vocalonix-widget.js` is ours and is what published
snippets load. It speaks Dograh's public embed protocol but owns its interface,
renders inside a shadow root so it cannot collide with the host page's CSS, and
aliases `window.DograhWidget` so snippets published before it existed keep
working. The vendored `dograh/ui/public/embed/dograh-widget.js` is still served
at `/embed/dograh-widget.js` for exactly that reason — do not remove it.

## Verification status

Last verified: 2026-08-15
- `bun run typecheck`: OK
- `bun run test`: 81 tests passed
- `docker compose up -d --build --wait`: OK (all services healthy)
- Full browser walkthrough on `http://localhost:3000`: signup → workspace
  creation → onboarding (profile, agent with the new voice picker and transfer
  number, opening hours, knowledge, widget) → publish → dashboard.
- Generated workflow inspected on the engine: seven nodes, seven edges, trade
  rules for the chosen vertical present, opening hours present, knowledge
  attached to the greeting and answering nodes, the message tool attached only
  to the message node.
- Widget verified on a third-party origin (`http://localhost:8099`): launcher,
  panel, suggested prompts, host-theme matching, mobile sheet layout, and the
  microphone-denied error path. Config, session init and TURN credential
  requests all returned 200 against the engine.
- Provider reconciliation verified against the running engine: a bad
  Deepgram/OpenAI pair is rejected with the per-service reason, and a bad
  Gemini key is caught by Vocalonix's own check.
- Telephony attach → duplicate-claim refusal → re-route → release → re-claim
  exercised against the dev database with a stubbed engine client.

Not covered by the last run:
- A real spoken call. No provider keys were available in this environment, so
  the audio path itself was not exercised end to end; everything up to the
  microphone prompt was.
- Real inbound PSTN. The Telnyx path was exercised with a stubbed engine
  client, not a live number.
- The email-verification branch of signup (`REQUIRE_EMAIL_VERIFICATION=false`
  locally).

## Local demo prerequisites

Dograh reports `turn_enabled` as `bool(TURN_SECRET)`, and the web app gates the
whole demo funnel on that flag: with `turnEnabled: false` the landing page hides
the **Hear it now** CTA entirely and **Start demo call** stays disabled, so the
funnel dead-ends at the voice step. `scripts/setup.sh` therefore generates
`TURN_SECRET` alongside the other local secrets. If an existing `.env` predates
that change, add `TURN_SECRET` and recreate the Dograh API container:

```bash
docker compose up -d --wait api
curl -fsS http://localhost:3001/api/dograh/health   # expect turnEnabled: true
```

Local WebRTC still succeeds over host candidates; the secret only flips the
capability flag and lets the widget request TURN credentials.

## End-to-end testing guide

Use this guide to walk through the full public → demo → signup → onboarding → dashboard flow. Test both locally (`http://localhost:3000`) and on Hetzner (`https://harkbell.com`).

### 1. Landing page

- Open `/`.
- Verify the page loads as the public landing page and does **not** redirect to `/secret`.
- Check the demo CTA is **“Hear it now”** and points at `/demo` (not `/secret`).
  It appears three times — nav, hero, and footer — as the secondary action next
  to the primary **Start setup →**. All three are hidden when
  `/api/dograh/health` reports `turnEnabled: false`.
- Click **“Hear it now”** — it should go to `/demo`.

### 2. Demo funnel (`/demo`)

- **Vertical selection**: Pick a live vertical. (Coming-soon verticals are disabled.)
- **Business basics**: Enter business name, city, services, and optional booking tool.
- **Intake**: Answer vertical-specific questions and enter contact details. Demo mode defaults to **“Talk in my browser”**.
- **Voice**: Pick a voice. Use the play icon to preview. Selecting a voice should not stop an already-playing preview.
- **Live call** (only if `turnEnabled` is `true`):
  - The timer (`01:00`) should be visible before the call starts.
  - Suggested caller scripts should be visible before connecting.
  - Click **Start call**, allow microphone, speak for up to 60 seconds, then **End call**.
- **Feedback**: Rate the call 1–5, pick chips, optionally add text.
  - **Positive (4–5)** redirects to `/signup` with `demoEmail`, `demoName`, and a `redirect` that includes `demoBusiness`, `demoCity`, and `demoVertical`.
  - **Neutral/negative (1–3)** goes to a thanks page.

### 3. Signup (`/signup`)

- Confirm the URL contains `demoEmail`, `demoName`, and the encoded `redirect` to `/app/onboarding/create?demoBusiness=...&demoCity=...&demoVertical=...`.
- Name and email should be pre-filled.
- Enter a password and submit.
- If verification is required, use the **verification preview link** in the alert.
- After account creation/verification, the app should redirect to `/app/onboarding/create` with the demo query params.

### 4. Create business workspace (`/app/onboarding/create`)

- Confirm `businessName`, `city`, and `vertical` are pre-filled from the demo.
- **Contact email must not** be pre-filled.
- Country, timezone, and locations use sensible defaults.
- Click **Create workspace →**.

### 5. Onboarding

The onboarding layout should not show the workspace side nav. It should have:
- A Vocalonix wordmark and an **Exit setup** link to `/app`.
- A stepper with clickable completed steps.

Steps:
1. **Business profile** — verify and save business identity.
2. **Agent** — set name, tone, voice, greeting, prompt, closing, and escalation guidance.
3. **Knowledge** — add a sample knowledge row.
4. **Widget** — set button text, accent color, and allowed domains. If already published, the embed snippet should render as a wrapped code block (no horizontal page scroll) with a **Copy** button.
5. **Review and publish** — review the summary.
   - Click **Publish this business**.
   - After publishing, the page should show a **Published** pill, a **Go to dashboard** primary button, and a small **Republish** ghost button.
   - Click **Go to dashboard**.

### 6. Dashboard

- The dashboard should load with the workspace side nav visible.
- The business name appears in the side nav workspace switcher. There is no
  topbar; it was removed in #43.
- You should be able to navigate to other workspace pages from the side nav.
- On a phone the bottom nav shows Today, Diary, Callbacks and Calls, plus
  **More** for the remaining seven destinations.

### Verification checklist

- `/api/health` returns `{"status":"ok"}`.
- `/api/dograh/health` returns `turnEnabled: true` for live-call testing.
- `/api/verticals` returns the vertical list.
- `POST /api/demo/sessions` and `POST /api/demo/sessions/:id/start` succeed for a valid session.
- The embed snippet code block uses `white-space: pre-wrap` and does not cause a
  horizontal page scroll. Check this at a narrow viewport (~420px) as well as at
  desktop width: `overflow-wrap: break-word` does not clamp the intrinsic
  min-content width, so a long unbreakable embed token can widen the whole page
  even though the `<pre>` itself reports no internal overflow. `.code-snippet pre`
  uses `overflow-wrap: anywhere` for this reason. Whether the bug shows at
  desktop width depends on the generated token, so it looks intermittent —
  assert `document.documentElement.scrollWidth <= clientWidth` rather than
  eyeballing it.

## Notes

- The API `build` script is currently `tsc --noEmit` only; the Docker image runs source directly.
- The `/secret/*` lab routes are gone; they were a second app shell around the
  same data. Their `/api/agent*` + `/api/knowledge*` endpoints still exist and
  still require a signed-in session, now reached from the workspace pages.
- Vite reads `VITE_*` from the repo-root `.env` (`envDir` in `app/web/vite.config.ts`), not from `app/web`.
- Voice previews are 32 kbps AAC at `app/web/public/voices/<name>.m4a`. Keep new
  ones in that format; the uncompressed WAVs were 4.3 MB across the set.
- Dograh credentials are server-side only; the browser loads the widget via an embed token.
- Local magic-link requests return a preview link instead of sending real email.
- A real spoken call requires Dograh model providers (STT, LLM, TTS) configured in the Dograh UI.
