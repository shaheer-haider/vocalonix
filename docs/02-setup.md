# Setup

Two ways to run it. Pick by what you are changing.

| You are changing… | Use |
|---|---|
| API logic, frontend, anything touching the engine, the worker, or a real call | **Full stack** (Docker Compose) |
| Frontend only, against an already-running engine | **App only** |

The full stack is the supported runtime. If a change cannot be demonstrated
there, it has not been demonstrated.

---

## Prerequisites

- Git with submodule support
- Docker and Docker Compose v2
- Bun 1.1.45 (for the app-only mode, and for `typecheck` / `test`)

## Full stack

```bash
git clone --recurse-submodules https://github.com/shaheer-haider/vocalonix.git
cd vocalonix
./scripts/setup.sh
docker compose up -d --build --wait
```

`scripts/setup.sh` initialises the submodule, copies `.env.example` to `.env`
if there is none, and generates every local secret that does not already have a
value — `AUTH_SECRET`, both Postgres passwords, Redis, MinIO, the Dograh service
password, and `TURN_SECRET`. It never overwrites a value you set. It also
appends empty placeholder lines for every provider key, so an `.env` created
before a key existed still shows you the line to fill in.

Then open:

| | |
|---|---|
| Web app | http://localhost:3000 |
| Harkbell API | http://localhost:3001/api/health |
| Dograh engine | http://localhost:8000 |
| Dograh dashboard | http://localhost:3010 |
| Harkbell Postgres | `localhost:5433` |

First boot pulls the Dograh images and can take several minutes. The API creates
a Dograh service account on its first request.

Stop with `docker compose down`. Add `-v` to also drop the volumes and start
from an empty database.

### The services

| Service | What it is |
|---|---|
| `harkbell-api` | Our Elysia API. Runs migrations on start, then serves :3001 |
| `vocalonix-worker` | Same image, `bun src/worker.ts`. Outbox + run ingestion |
| `vocalonix-web` | Vite build served by nginx on :3000 |
| `vocalonix-db` | Our Postgres 16, on host port 5433 |
| `api`, `ui`, `postgres`, `redis`, `minio` | Dograh's own stack, extended from `dograh/docker-compose.yaml` |

Note the two Postgres instances. Ours is `vocalonix-db` on 5433; the one called
`postgres` belongs to Dograh. Never point `DATABASE_URL` at Dograh's.

## App only

Use when Dograh is already running locally or remotely.

```bash
bun install
./scripts/dev-app.sh
```

`dev-app.sh` sources the root `.env`, runs migrations, and starts the API, the
worker and Vite concurrently. You must have `DATABASE_URL`, `AUTH_SECRET`, the
three `DOGRAH_*` URLs, and either `DOGRAH_API_KEY` or the service
email/password pair.

---

## Making calls actually work

The API refuses to boot on an invalid environment (`app/api/src/env.ts`), but it
will happily boot with no provider keys at all — it just cannot place a call.
The dashboard's **Setup** panel (`GET /api/platform/status`) reports exactly
what is missing and the environment variable that fixes it.

| What you want | What to set |
|---|---|
| Calls working at all | `GEMINI_API_KEY` |
| Calls working *well* | `DEEPGRAM_API_KEY` + `OPENAI_API_KEY` |
| A real phone number | `TELNYX_API_KEY` (+ `TELNYX_WEBHOOK_PUBLIC_KEY` in production) |
| Real sign-in emails | `RESEND_API_KEY` + a verified sending domain |
| Paid plans | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO` |
| Transcript mining (contacts, gaps) | `GEMINI_API_KEY` or `OPENAI_API_KEY` |

Paste keys into `.env` and restart the API. Keys are validated: Deepgram,
OpenAI and ElevenLabs are checked against the real provider APIs by the engine
and a rejection is shown verbatim; Google keys are not checked by the engine, so
Harkbell verifies `GEMINI_API_KEY` itself against the Generative Language API.

You never open the Dograh dashboard to configure models.
`app/api/src/platform/providers.ts` pushes the resolved stack into Dograh's
organisation model configuration at API boot.

### `VOICE_STACK`

- `auto` (default) — use the Deepgram STT → LLM → Deepgram TTS **pipeline** when
  the keys allow it, otherwise fall back to realtime speech-to-speech.
- `pipeline` — force the pipeline.
- `realtime` — force speech-to-speech.

The pipeline is the recommended stack for launch: it puts transcription on its
own stream, which is what makes interruptions and knowledge answers reliable.
See [`STATUS.md`](../STATUS.md) for the current production setting and the open
disagreement about it.

### `TURN_SECRET` and the demo

Dograh reports `turn_enabled` as `bool(TURN_SECRET)`, and the web app gates the
whole demo funnel on that flag — with `turnEnabled: false` the landing page hides
the **Hear it now** CTA and **Start demo call** stays disabled. `setup.sh`
generates `TURN_SECRET`, but an `.env` predating that change will not have it:

```bash
docker compose up -d --wait api
curl -fsS http://localhost:3001/api/dograh/health   # expect turnEnabled: true
```

Local WebRTC still works over host candidates without it; the secret only flips
the capability flag and lets the widget request TURN credentials.

---

## Environment variables

`app/api/src/env.ts` is the authority: it declares every variable, its type, its
default, and the extra rules that apply when `NODE_ENV=production`. An invalid
environment throws at import time with the field errors printed — the API will
not start half-configured.

### Required everywhere

`DATABASE_URL`, `AUTH_SECRET` (≥32 chars), `API_PUBLIC_URL`, `APP_ORIGIN`,
`EMAIL_FROM`, `DOGRAH_INTERNAL_URL`, `DOGRAH_PUBLIC_API_URL`,
`DOGRAH_WIDGET_URL`, `DOGRAH_SERVICE_EMAIL`, `DOGRAH_SERVICE_PASSWORD`,
`DOGRAH_SERVICE_NAME`, `DOGRAH_WORKFLOW_NAME`, `DOGRAH_WIDGET_ALLOWED_DOMAINS`,
and the `VOICE_*` model names (all defaulted).

### Additionally enforced in production

| Rule | Why |
|---|---|
| `AUTH_SECRET` ≠ the development default | It also derives the agent-tool key |
| `RESEND_API_KEY` set | Otherwise nobody can receive a sign-in link |
| `API_PUBLIC_URL` is HTTPS | |
| Every origin in `APP_ORIGIN` is HTTPS | Comma-separated list |
| `REQUIRE_EMAIL_VERIFICATION=true` | |
| `DOGRAH_API_KEY` set, or a service password that is not the placeholder | |

### Notable optional ones

| Variable | Effect |
|---|---|
| `HARKBELL_INTERNAL_URL` | Where the **engine** reaches our agent-tool endpoints. Defaults to `API_PUBLIC_URL`. In Compose it is `http://harkbell-api:3001`. It is part of the config hash, so changing it re-registers every agent |
| `DOGRAH_STORAGE_INTERNAL_URL` | MinIO, for knowledge uploads |
| `MAX_OWNED_WORKSPACES` | Default 50. An abuse backstop, not a product limit — the plan governs how many businesses an account may run |
| `MAGIC_LINK_TTL_SECONDS` | 60–3600, default 900 |
| `VITE_API_BASE_URL` | **Frontend only.** Read from the repo-root `.env` (`envDir` in `app/web/vite.config.ts`), not from `app/web` |

Only `VITE_`-prefixed variables ever reach the browser. Nothing else may.

---

## Database changes

```bash
# 1. edit app/api/src/db/schema.ts
bun run db:generate     # writes app/api/drizzle/NNNN_*.sql and a snapshot
bun run db:migrate      # applies it
```

Commit the generated SQL and the snapshot together with the schema change. The
API container runs `db:migrate` on start, so a missing migration file means a
successful build and a broken deploy.

Never hand-write a migration to work around a generation you dislike — change
the schema until Drizzle generates what you want.

## Local email and magic links

With no `RESEND_API_KEY`, sign-up verification and magic links are not sent.
The API returns the link in the response and the UI shows it as a preview,
rather than pretending an email went out. This only happens outside production.
