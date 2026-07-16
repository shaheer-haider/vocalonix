# Vocalonix overview

Vocalonix is a web-first dashboard that lets a business configure, publish, and embed a self-hosted AI voice agent. A signed-up user creates a **business workspace**, customises the agent, uploads knowledge, and publishes a browser-call widget. The browser never talks to the underlying voice platform (Dograh) directly; Vocalonix manages Dograh workflows and embed tokens on the server, exposing only the public widget script to the browser.

The current codebase contains two products in one repository:

1. **The authenticated workspace** (`/app/*`, `/account`, `/login`, `/signup`, `/magic`, `/verify-email`, `/invite/:token`) — real multi-business tenants, roles, invitations, and team management.
2. **The unprotected MVP lab** (`/secret/*`) — an intentionally unauthenticated Dograh testing UI where the first request to `/api/agent` bootstraps a single managed workflow. This lab exists while tenant-scoped sync is being built.

## Tech stack

| Technology | Version | Role in this project |
|---|---|---|
| Bun | `1.1.45` (lockfile) | Runtime and package manager for `app/api` and `app/web` |
| TypeScript | `5.7.3` | Both API and web codebases |
| Elysia | `1.1.25` | HTTP framework for the API (`app/api/src/index.ts:85`) |
| better-auth | `1.6.11` | Password, magic-link, and session management (`app/api/src/auth/config.ts:10`) |
| Drizzle ORM + Drizzle Kit | `0.45.2` / `0.31.10` | Postgres schema, migrations, and queries (`app/api/src/db/schema.ts:1`) |
| postgres.js | `3.4.9` | Postgres driver (`app/api/src/db/client.ts:7`) |
| Zod | `4.4.2` | API validation and frontend form schemas |
| React | `19.0.0` | UI library |
| Vite | `6.0.7` | Build tool and dev server (`app/web/vite.config.ts:11`) |
| TanStack Router | `1.121.0` | Client-side routing (`app/web/src/router.tsx:1`) |
| TanStack Query | `5.100.8` | Server state (loaded, not widely used in this MVP) |
| React Hook Form + Zod resolver | `7.75.0` / `5.2.2` | Form state and validation |
| Docker + Docker Compose v2 | | Full local runtime including Dograh |
| Dograh | `1.41.0` | Self-hosted voice-agent platform (git submodule) |
| PostgreSQL | `16-alpine` | Vocalonix database; `pgvector/pgvector:pg17` for Dograh |
| Redis | `7` | Dograh internal queue/cache |
| MinIO | | Dograh/S3-compatible storage for knowledge files |
| nginx | `1.27-alpine` | Static web server in production image |

## High-level architecture

```mermaid
flowchart TB
    subgraph Browser
        P[Public pages /secret/*]
        A[Authenticated pages /app/*]
        W[Embedded widget on third-party site]
    end

    subgraph "Vocalonix (this repo)"
        WEB[app/web nginx :3000]
        API[app/api Elysia :3001]
        WORKER[app/api worker src/worker.ts:12]
        DB[(vocalonix-db PostgreSQL :5433)]
    end

    subgraph "Dograh (submodule)"
        DAPI[dograh-api :8000]
        DUI[dograh-ui :3010]
        DDB[(postgres :5432)]
        DREDIS[redis :6379]
        DMINIO[minio :9000]
    end

    Browser -->|HTTP /api/*| WEB
    WEB -->|proxy /api/*| API
    API -->|HTTP cookie session| DB
    API -->|Dogra management calls| DAPI
    DAPI --> DDB & DREDIS & DMINIO
    WORKER -->|polls outbox_events| DB
    WORKER -->|Dogra management calls| DAPI
    W -->|loads dograh-widget.js| WEB
    W -->|WebRTC call| DAPI
```

Key design point: `app/api` is the only service that holds Dograh credentials. The browser receives a short-lived embed token for the widget, not the Dograh API key or service password (`app/api/src/dograh/client.ts:79`).

## Repository structure

```text
/
├── app/
│   ├── api/               # Elysia backend, auth, workspace, Dograh integration, worker
│   │   ├── src/
│   │   │   ├── index.ts           # Elysia app definition and route wiring
│   │   │   ├── env.ts             # Runtime environment validation
│   │   │   ├── db/
│   │   │   │   ├── schema.ts      # Drizzle table definitions
│   │   │   │   ├── client.ts      # Drizzle/postgres client
│   │   │   │   └── migrate.ts     # Migration runner
│   │   │   ├── auth/
│   │   │   │   ├── config.ts      # better-auth configuration
│   │   │   │   ├── routes.ts      # /api/auth/* endpoints
│   │   │   │   └── email.ts       # Resend + magic/verification link capture
│   │   │   ├── workspace/
│   │   │   │   ├── routes.ts      # /api/businesses, /api/b/*, invitations
│   │   │   │   ├── permissions.ts # Role matrix
│   │   │   │   └── context.ts     # Session/workspace loaders
│   │   │   ├── tenant/
│   │   │   │   └── routes.ts      # /api/b/:slug/settings, knowledge, publish
│   │   │   ├── dograh/
│   │   │   │   ├── client.ts      # HTTP client to Dograh API
│   │   │   │   ├── tenant.ts      # Sync logic, outbox helpers
│   │   │   │   ├── workflow.ts    # Legacy single-workflow management
│   │   │   │   ├── config.ts      # Desired workflow definition builder
│   │   │   │   ├── errors.ts      # Failure classification
│   │   │   │   └── types.ts       # Dograh DTOs and TenantAgentSettings
│   │   │   ├── outbox.ts          # Outbox event processor
│   │   │   ├── worker.ts          # Background worker entry
│   │   │   └── uploads.ts         # Document filename validation
│   │   ├── drizzle/               # Generated migration SQL
│   │   ├── Dockerfile
│   │   └── package.json
│   └── web/               # React + Vite frontend
│       ├── src/
│       │   ├── main.tsx           # React root
│       │   ├── App.tsx            # Test agent / knowledge / agent settings lab
│       │   ├── router.tsx         # TanStack route tree
│       │   ├── api.ts             # Eden Treaty API client + auth helpers
│       │   ├── auth/
│       │   │   └── AuthProvider.tsx
│       │   ├── routes/
│       │   │   ├── public.tsx     # Landing, login, signup, magic, verify
│       │   │   ├── account.tsx    # /app, /account, sessions
│       │   │   ├── business.tsx   # Workspace create, team, invitations
│       │   │   ├── tenant.tsx     # Onboarding and settings
│       │   │   └── DesignSystem.tsx
│       │   ├── components/
│       │   │   ├── shell/         # Page, auth, workspace, onboarding, nav shells
│       │   │   └── ui/            # Reusable UI primitives
│       │   ├── permissions.ts     # Client-side role matrix
│       │   └── types.ts           # Frontend shared types
│       ├── Dockerfile
│       ├── nginx.conf
│       └── vite.config.ts
├── dograh/                # Git submodule (Dograh 1.41.0)
│   ├── docker-compose.yaml
│   └── api/               # Dograh FastAPI backend
├── docker-compose.yml     # Vocalonix + Dograh combined runtime
├── .env.example           # Local environment template
├── scripts/
│   ├── setup.sh           # Generates .env, secrets, validates compose
│   ├── start.sh           # setup.sh + docker compose up --build
│   └── dev-app.sh         # Bun-only dev mode
├── package.json           # Workspace root scripts
└── bun.lockb
```

### What each top-level directory does

- `app/api/` — the only service that touches Dograh and the only place where business rules and secrets are enforced.
- `app/web/` — static SPA built with Vite. The nginx config (`app/web/nginx.conf:8`) falls back to `index.html` for all routes, so deep links work.
- `dograh/` — upstream Dograh platform. The Vocalonix `docker-compose.yml` extends `dograh/docker-compose.yaml` for `postgres`, `redis`, `minio`, `api`, and `ui`.
- `scripts/` — human-friendly entry points for the two supported run modes.
- `docs/` — this documentation set.

## Entry points

| Entry point | File | Command / trigger |
|---|---|---|
| API server | `app/api/src/index.ts:219` | `bun run --cwd app/api start` or Docker `CMD` |
| Background worker | `app/api/src/worker.ts:12` | `bun src/worker.ts` or `docker compose` command `bun src/worker.ts` |
| Web SPA | `app/web/src/main.tsx:21` | `bun run --cwd app/web dev` or nginx static |
| Database migrations | `app/api/src/db/migrate.ts:10` | `bun run db:migrate` |
| Full local stack | `scripts/start.sh:5` | `./scripts/start.sh` |
| Bun-only dev | `scripts/dev-app.sh:15` | `./scripts/dev-app.sh` |

The worker is not a message-queue consumer; it polls the `outbox_events` table in the same Postgres database (`app/api/src/worker.ts:12`).

## External dependencies

| Service | Default local URL | Used by | Required? |
|---|---|---|---|
| Vocalonix Postgres | `postgres://vocalonix:vocalonix@localhost:5433/vocalonix` | API, worker, migrations | Yes |
| Dograh API | `http://localhost:8000` (public), `http://api:8000` (internal) | API, worker | Yes |
| Dograh storage | `http://minio:9000` internal | API, worker | Yes (for uploads) |
| Resend | `https://api.resend.com/emails` | `app/api/src/auth/email.ts:33` | Only for production email |
| Redis / MinIO / Dograh Postgres | Started by `docker-compose.yml` | Dograh services | Yes for full stack |

