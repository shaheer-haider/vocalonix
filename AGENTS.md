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
- Worker entry: `app/api/src/worker.ts`
- Frontend entry: `app/web/src/main.tsx`
- Route definitions: `app/web/src/router.tsx`
- Demo route: `app/web/src/routes/demo.tsx`
- Demo API: `app/api/src/demo/*`
- Database schema: `app/api/src/db/schema.ts`
- Dograh integration: `app/api/src/dograh/*`

## Verification status

Last verified: 2026-08-05
- `bun install --frozen-lockfile`: OK
- `bun run typecheck`: OK
- `bun run test`: 23 tests passed
- `bun run --cwd app/web build`: OK
- `docker compose up -d --build --wait`: OK (all services healthy)
- Hetzner deploy: OK (`vocalonix-api`, `vocalonix-web`, `vocalonix-worker`, `caddy` healthy)
- `/api/dograh/health` reports `turnEnabled: true` (local and Hetzner)
- `/api/verticals` and `/api/demo/sessions` endpoints respond on Hetzner
- Browser walkthrough of the full `/demo` → signup → onboarding → dashboard flow:
  OK on both `http://localhost:3000` and `https://62-238-101-107.sslip.io`,
  driven with Playwright against real Chrome.
- Real spoken demo call verified end to end on both environments: microphone
  granted, caller speech transcribed, agent replied within its guardrails
  (declined to quote or check availability and offered a message instead),
  the caller interrupted the agent mid-sentence, and hanging up advanced to
  the feedback step. Transcripts are in the Dograh DB (`workflow_runs`) and
  MinIO (`voice-audio/transcripts/<run_id>.txt`); local runs used
  `gemini-3.1-flash-live-preview`.
- Demo lifecycle persists to `demo_sessions` (status, duration, score, outcome,
  workflow id).
- Both feedback branches verified: score 4–5 redirects to `/signup` with the
  demo params; score 1–3 lands on the thanks page.

Not covered by the last run:
- The email-verification branch of signup. Both environments run with
  `REQUIRE_EMAIL_VERIFICATION=false`, so signup completes without a preview
  link.

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

Use this guide to walk through the full public → demo → signup → onboarding → dashboard flow. Test both locally (`http://localhost:3000`) and on Hetzner (`https://62-238-101-107.sslip.io`).

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
- The business name should appear in the top bar.
- You should be able to navigate to other workspace pages from the side nav.

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
- The `/secret/*` routes are intentionally unprotected in this MVP.
- Dograh credentials are server-side only; the browser loads the widget via an embed token.
- Local magic-link requests return a preview link instead of sending real email.
- A real spoken call requires Dograh model providers (STT, LLM, TTS) configured in the Dograh UI.
