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
- Database schema: `app/api/src/db/schema.ts`
- Dograh integration: `app/api/src/dograh/*`

## Verification status

Last verified: 2026-07-31
- `bun install --frozen-lockfile`: OK
- `bun run typecheck`: OK
- `bun run test`: 23 tests passed
- `bun run --cwd app/web build`: OK
- `docker compose up -d --build --wait`: OK (all services healthy)
- Browser test recording: desktop and mobile videos captured

## Notes

- The API `build` script is currently `tsc --noEmit` only; the Docker image runs source directly.
- The `/secret/*` routes are intentionally unprotected in this MVP.
- Dograh credentials are server-side only; the browser loads the widget via an embed token.
- Local magic-link requests return a preview link instead of sending real email.
