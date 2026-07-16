# Vocalonix documentation

This is the internal technical documentation for the Vocalonix codebase. Each file is written from the actual source, not from assumptions or file names.

## Reading order

**First day — understand the system**

1. [`01-overview.md`](01-overview.md) — What the project is, the tech stack, high-level architecture diagram, repo layout, and external dependencies.
2. [`02-setup.md`](02-setup.md) — How to install, build, run, and test the project. Includes every environment variable and common failure fixes.
3. [`03-architecture.md`](03-architecture.md) — Layer/module responsibilities, state management, data storage, and key design decisions.

**First week — understand the flows and UI**

4. [`04-flows.md`](04-flows.md) — Step-by-step walkthroughs of every user journey and internal process, with sequence diagrams and file:line references.
5. [`05-api-reference.md`](05-api-reference.md) — Every HTTP endpoint: method, path, auth, body, response, and errors.
6. [`06-components.md`](06-components.md) — Screen inventory, component hierarchies, shared UI primitives, and routing/guards.

**Deep dives**

7. [`07-how-things-work.md`](07-how-things-work.md) — Non-obvious mechanics: auth, CORS, Dograh client auth, sync engine, outbox, permissions, widget, environment validation.
8. [`08-glossary-and-conventions.md`](08-glossary-and-conventions.md) — Project-specific terms, code conventions, and testing conventions.

**Verification gaps**

9. [`99-open-questions.md`](99-open-questions.md) — Anything not verified, ambiguous, or requiring follow-up.

## Quick commands

```bash
# Full stack with Docker
./scripts/start.sh

# Or background
docker compose up -d --build --wait

# Bun-only app (when Dograh is already running)
./scripts/dev-app.sh

# Tests, typecheck, build
bun run test
bun run typecheck
bun run build

# Migrations
bun run db:migrate
```

## Useful entry points

- API route wiring: `app/api/src/index.ts:85`
- Auth configuration: `app/api/src/auth/config.ts:10`
- Database schema: `app/api/src/db/schema.ts:1`
- React main: `app/web/src/main.tsx:21`
- Route tree: `app/web/src/router.tsx:282`
- Router export: `app/web/src/router.tsx:315`
- Worker loop: `app/api/src/worker.ts:12`

