# Setup

## Prerequisites

- **Git** with submodule support
- **Docker** and **Docker Compose v2** (the only fully supported runtime)
- **Bun** `1.1.45` — the engine pinned in `package.json:25`. The local verification in this doc was run with `1.3.0`, but `1.1.45` is the project target.
- Ports free on the host:
  - `3000` — Vocalonix web
  - `3001` — Vocalonix API
  - `5432` — Dograh Postgres
  - `5433` — Vocalonix Postgres
  - `6379` — Redis
  - `8000` — Dograh API
  - `9000` / `9001` — MinIO
  - `3010` — Dograh UI

## Full stack setup (Docker Compose, recommended)

These commands were verified by running them on macOS and confirming the health endpoints responded.

```bash
# 1. Clone and initialise the Dograh submodule
git clone --recurse-submodules https://github.com/shaheer-haider/vocalonix.git
cd vocalonix

# 2. Generate .env, secrets, and validate compose
./scripts/setup.sh
# Output: "Vocalonix is configured. Run ./scripts/start.sh to start the stack."

# 3. Build and start everything
./scripts/start.sh
# Equivalent to: ./scripts/setup.sh && docker compose up --build

# 4. Wait for all services to be healthy (run in a second terminal)
docker compose ps

# 5. Verify Vocalonix API and Dograh integration
curl -fsS http://localhost:3001/api/health
curl -fsS http://localhost:3001/api/dograh/status

# 6. Open the app
open http://localhost:3000
```

`./scripts/setup.sh` does the following (`scripts/setup.sh:1`):
1. Runs `git submodule update --init --recursive`.
2. Copies `.env.example` to `.env` if missing.
3. Generates cryptographically random values for `OSS_JWT_SECRET`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `VOCALONIX_POSTGRES_PASSWORD`, `AUTH_SECRET`, and `DOGRAH_SERVICE_PASSWORD`.
4. Sets `DATABASE_URL` to `postgres://vocalonix:<generated>@localhost:5433/vocalonix`.
5. Validates the Docker Compose file with `docker compose config`.

`./scripts/start.sh` does the following (`scripts/start.sh:1`):
1. Runs `setup.sh`.
2. Runs `docker compose up --build` (foreground, blocking). The API container runs migrations automatically before starting (`app/api/Dockerfile:12`).

### To run the stack in the background

Replace the final command with:

```bash
docker compose up -d --build --wait
```

Then use `docker compose logs -f vocalonix-api` to watch the API.

### To stop the stack

```bash
docker compose down
```

To also remove all Postgres / Redis / MinIO volumes:

```bash
docker compose down -v
```

## App-only setup (Bun, when Dograh is already running)

Use this when Dograh is already available locally or remotely and you only want to run the Vocalonix web and API.

```bash
# 1. Install dependencies
bun install --frozen-lockfile

# 2. Create .env from the example and fill it in
cp .env.example .env
# Edit .env: set DATABASE_URL, AUTH_SECRET, DOGRAH_INTERNAL_URL,
# DOGRAH_PUBLIC_API_URL, DOGRAH_WIDGET_URL, and either DOGRAH_API_KEY or
# DOGRAH_SERVICE_EMAIL + DOGRAH_SERVICE_PASSWORD.

# 3. Run migrations
bun run db:migrate

# 4. Start the Bun dev stack (API, worker, and web in one command)
./scripts/dev-app.sh
# Equivalent to: source .env && bun run db:migrate && bun run dev
```

`./scripts/dev-app.sh` (`scripts/dev-app.sh:14`) runs `bun run --cwd app/api dev` and `bun run --cwd app/api worker` and `bun run --cwd app/web dev` via `concurrently` (`package.json:10`).

## Environment variables

All variables are read from the shell environment by `app/api/src/env.ts:122` and `app/web/src/api.ts:11` (Vite `import.meta.env`).

### Vocalonix application

| Variable | Purpose | Example | Required |
|---|---|---|---|
| `APP_ORIGIN` | Comma-separated allowed browser origins for CORS and callback URLs | `http://localhost:3000` | Yes |
| `VITE_API_BASE_URL` | Browser-facing API base URL, baked into the web build | `http://localhost:3001` | Yes for build |
| `VOCALONIX_API_PUBLIC_URL` | Alias used by `docker-compose.yml` for `API_PUBLIC_URL` | `http://localhost:3001` | Yes in Compose |
| `API_PUBLIC_URL` | Public base URL for better-auth callbacks and links | `http://localhost:3001` | Yes |
| `NODE_ENV` | Runtime mode: `development`, `test`, or `production` | `development` | Yes |

### Vocalonix database and sessions

| Variable | Purpose | Example | Required |
|---|---|---|---|
| `VOCALONIX_POSTGRES_USER` | Postgres user for `vocalonix-db` | `vocalonix` | Yes in Compose |
| `VOCALONIX_POSTGRES_PASSWORD` | Postgres password for `vocalonix-db` | (generated) | Yes in Compose |
| `VOCALONIX_POSTGRES_DB` | Database name for `vocalonix-db` | `vocalonix` | Yes in Compose |
| `VOCALONIX_POSTGRES_PORT` | Host port mapped to `vocalonix-db` | `5433` | Optional, defaults to `5433` |
| `DATABASE_URL` | Full Postgres connection string used by API and worker | `postgres://vocalonix:...@localhost:5433/vocalonix` | Yes |
| `AUTH_SECRET` | better-auth secret for signing session cookies | (generated) | Yes, must be ≥32 chars |
| `REQUIRE_EMAIL_VERIFICATION` | `true` to require verified email before login | `false` | Optional, defaults to `false` in dev, `true` in production |
| `RESEND_API_KEY` | Resend API key for sending real email | `re_...` | Required in production; local dev shows preview links |
| `EMAIL_FROM` | Sender address for Resend | `Vocalonix <hello@vocalonix.ai>` | Required in production |
| `MAGIC_LINK_TTL_SECONDS` | Magic-link lifetime | `900` | Optional, defaults to `900` |

### Dograh integration

| Variable | Purpose | Example | Required |
|---|---|---|---|
| `DOGRAH_INTERNAL_URL` | Dograh API base URL from inside the Docker network | `http://api:8000` | Yes |
| `DOGRAH_PUBLIC_API_URL` | Dograh API base URL for the browser widget | `http://localhost:8000` | Yes |
| `DOGRAH_WIDGET_URL` | Host that serves the widget script, used in snippet URLs | `http://localhost:3000` | Yes |
| `DOGRAH_STORAGE_INTERNAL_URL` | MinIO/S3 endpoint for uploading knowledge bytes | `http://minio:9000` | Yes |
| `DOGRAH_API_KEY` | Static Dograh API key, if used instead of service account | | Optional |
| `DOGRAH_SERVICE_EMAIL` | Service account email for the Dograh integration | `vocalonix@vocalonix.ai` | Yes |
| `DOGRAH_SERVICE_PASSWORD` | Service account password for the Dograh integration | (generated) | Yes |
| `DOGRAH_SERVICE_NAME` | Display name for the service account | `Vocalonix` | Yes |
| `DOGRAH_WORKFLOW_NAME` | Fallback name for the legacy single workflow | `Vocalonix Agent` | Yes |
| `DOGRAH_WIDGET_ALLOWED_DOMAINS` | Comma-separated allowed widget domains | `localhost,127.0.0.1` | Yes |

### Dograh-only (managed by `docker-compose.yml`, not read by Vocalonix code)

| Variable | Purpose | Example |
|---|---|---|
| `DOGRAH_VERSION` | Pinned Dograh image tag | `1.41.0` |
| `ENVIRONMENT` | Dograh deployment mode | `local` |
| `ENABLE_SIGNUP` | Whether Dograh local auth signups are allowed | `true` |
| `ENABLE_TELEMETRY` | Posthog telemetry toggle | `false` |
| `BACKEND_API_ENDPOINT` | Dograh public API endpoint | `http://localhost:8000` |
| `MINIO_PUBLIC_ENDPOINT` | MinIO public endpoint | `http://localhost:9000` |
| `TURN_HOST` | TURN server host | `localhost` |
| `OSS_JWT_SECRET` | Secret for Dograh JWTs | (generated) |
| `POSTGRES_PASSWORD` | Dograh Postgres password | (generated) |
| `REDIS_PASSWORD` | Redis password | (generated) |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | MinIO credentials | (generated) |

## How to run tests and build

Verified commands:

```bash
# Run API unit tests
bun run test

# Run TypeScript checks on both packages
bun run typecheck

# Build both packages (web build emits to app/web/dist)
bun run build
```

Test output observed locally:

```text
23 pass
0 fail
188 expect() calls
Ran 23 tests across 6 files.
```

The CI pipeline runs the same sequence (`.github/workflows/ci.yml:37-41`):

```bash
bun install --frozen-lockfile
./scripts/setup.sh
bun run db:migrate
bun run typecheck
bun run test
bun run build
```

## Common setup failures and fixes

### `bun: command not found`

Install Bun via `curl -fsSL https://bun.sh/install | bash` and restart the shell. The lockfile is `bun.lockb`; `npm` / `pnpm` are not tested.

### `docker compose up` fails because ports are already in use

Check which services are bound to the required ports and stop them, or edit the `ports` blocks in `docker-compose.yml` and update the corresponding URLs in `.env`.

### `Failed to fetch` on `http://localhost:3000` even though `/api/health` is OK

The web container must be built with the correct `VITE_API_BASE_URL`. The API defaults `APP_ORIGIN` to `http://localhost:3000`, but the browser uses the URL it is loaded from. If you preview the web on a different port, set `APP_ORIGIN` to that origin and rebuild (`docker compose up -d --build`).

### `DATABASE_URL` connection refused during `bun run db:migrate`

If running app-only, ensure `vocalonix-db` is running. The default `DATABASE_URL` expects Postgres on `localhost:5433`. Start just the database with:

```bash
docker compose up -d vocalonix-db
```

### `Invalid environment` errors on API start

`app/api/src/env.ts:159` throws if validation fails. Common causes:

- `AUTH_SECRET` is missing or shorter than 32 characters.
- `APP_ORIGIN` is not a valid origin list.
- `DATABASE_URL` is not a valid URL.
- In production mode, `RESEND_API_KEY`, `EMAIL_FROM`, `API_PUBLIC_URL`, and `APP_ORIGIN` HTTPS checks are enforced.

### `docker compose` healthcheck loops on `api` or `vocalonix-api`

First run of Dograh pulls images and may take several minutes. If `vocalonix-api` reports `Failed to fetch` errors in its logs, the most likely cause is `api` not yet healthy. Wait for `api` to be healthy (`docker compose ps`) and then restart the dependent containers:

```bash
docker compose restart vocalonix-api vocalonix-web vocalonix-worker
```

### `bun run test` fails with `ECONNREFUSED` to `localhost:5433`

The unit tests do not require a database, but `NODE_ENV=test` still validates `DATABASE_URL` (`app/api/src/env.ts:122`). If you have overridden `.env`, ensure `DATABASE_URL` is syntactically valid even if unused.

