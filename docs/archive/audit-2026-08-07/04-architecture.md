# Vocalonix Architecture & Code Quality Improvements

## 1. Separation of concerns & coupling

### 1.1 Secret MVP lab routes share global state with tenant workflows

- **Files**: `app/api/src/index.ts`, `app/api/src/dograh/workflow.ts`, `app/api/src/dograh/config.ts`, `app/api/src/dograh/tenant.ts`
- **Current**: `index.ts` exposes `/api/agent`, `/api/knowledge`, `/api/agent/widget` that use `ensureWorkflow()` from `workflow.ts`. `tenant.ts` uses `synchronizeBusiness()` from `config.ts`. Both create Dograh workflows, but `workflow.ts` uses prefix `[Vocalonix]` while `config.ts` uses `[Vocalonix:${business.id}]`.
- **Problem**: Two different code paths produce overlapping workflow namespaces. The secret lab can accidentally bind to a tenant workflow and vice versa (see `02-bugs.md` #1).
- **Recommendation**:
  1. Move all workflow creation logic into `dograh/tenant.ts` and delete or rename `dograh/workflow.ts`.
  2. Give the secret lab a distinct namespace (`[Vocalonix:lab]`) and have it call a single `ensureBusinessWorkflow(businessId?)` function where `businessId` is `undefined` for the lab.
  3. Deprecate the global `/api/knowledge`, `/api/agent`, and `/api/agent/widget` endpoints in favor of `/api/b/:slug/...`.
- **Expected impact**: Eliminates cross-tenant workflow collisions and removes duplicated workflow-building code.

### 1.2 Knowledge upload is implemented twice

- **Files**: `app/api/src/index.ts:168-214` and `app/api/src/tenant/routes.ts:578-741`
- **Current**: The global `/api/knowledge` endpoint (MVP lab) and tenant `/api/b/:slug/knowledge` endpoint both validate file extension, size, and call `dograh.requestUpload` / `dograh.uploadFile` / `dograh.processDocument`.
- **Problem**: Code duplication with diverging limits (5 MB vs 10 MB) and diverging file handling (`File` vs `Uint8Array`).
- **Recommendation**: Extract a `saveKnowledge(businessId, input, source)` service function in `app/api/src/knowledge/service.ts` and call it from both route modules.
- **Expected impact**: Single source of truth for file validation, size limits, and processing.

### 1.3 `ensureTenantRows` is repeated in every tenant route

- **Files**: `app/api/src/tenant/routes.ts` (lines 216, 265, 322, 357, 404, 459, etc.)
- **Current**: Nearly every handler calls `await ensureTenantRows(workspace.business.id)` before touching `business_agent_settings` / `business_onboarding`.
- **Problem**: Cross-cutting data integrity concern is scattered across route handlers.
- **Recommendation**: Guarantee these rows exist with a database `BEFORE` trigger or a single `requireTenantConfiguration(businessId)` helper that is called once in `requireWorkspace`.
- **Expected impact**: Fewer boilerplate lines and reduced risk of forgetting the guard.

### 1.4 Audit-log writes are inline in route handlers

- **Files**: `app/api/src/workspace/routes.ts`, `app/api/src/tenant/routes.ts`
- **Current**: Every mutating endpoint manually builds an `auditLogs` insert object and `randomUUID()`.
- **Problem**: Logging is tangled with business logic; omissions are easy.
- **Recommendation**: Introduce an `audit(service)` helper or Elysia `onAfterHandle` hook that records the route, actor, and payload for mutating methods automatically.
- **Expected impact**: Consistent audit coverage and cleaner route handlers.

### 1.5 Frontend data fetching is per-route and uncached

- **Files**: `app/web/src/routes/business.tsx:148-172`, `app/web/src/routes/tenant.tsx:68-95`, `app/web/src/routes/account.tsx:113-135`
- **Current**: Each route uses `useState` + `useEffect` with a manual `cancelled` flag.
- **Problem**: Navigating between settings tabs re-fetches the same `business`/`settings` object; inconsistent loading and error states; no optimistic updates.
- **Recommendation**: Adopt `@tanstack/react-query` (already in `package.json`) for server-state caching, invalidation, and optimistic updates.
- **Expected impact**: Fewer requests, faster navigation, simpler components.

## 2. Missing tests

The test suite currently covers only 6 small utility files (`outbox.test.ts`, `uploads.test.ts`, `permissions.test.ts`, `dograh/config.test.ts`, `dograh/errors.test.ts`, `dograh/tenant.test.ts`). The highest-risk untested paths are:

| Area | Risk | Suggested test names |
|---|---|---|
| Auth routes | Critical | `signup creates user and sets session cookie`, `login rejects invalid password`, `magic link lifecycle: request → consume → reuse`, `email verification callback marks verified` |
| Workspace routes | Critical | `create business creates mapping and onboarding rows`, `duplicate slug returns 409`, `last owner cannot be demoted`, `role update respects hierarchy`, `invitation accepts and creates membership`, `revoked invitation cannot be accepted` |
| Tenant routes | High | `profile update normalizes country and triggers sync`, `agent settings update builds correct workflow`, `knowledge upload queues outbox event`, `publish creates embed token`, `widget endpoint returns 409 until synced` |
| Dograh client | High | `authenticate reuses cached token`, `401 retries login once`, `listDocuments pagination is requested`, `uploadFile sends correct Content-Type` |
| Outbox worker | High | `processNextEvent handles each event type`, `stuck events are recovered after lease expiry`, `failed events stop retrying after maxAttempts` |
| Frontend routes | Medium | `WorkspaceShell redirects to login when unauthenticated`, `TenantSettingsPage renders read-only for Viewer`, `KnowledgeManager shows processing state` |
| Environment | Medium | `production env rejects default AUTH_SECRET`, `missing RESEND_API_KEY fails in production` |

## 3. Dependencies & runtime

### 3.1 Bun version is pinned to 1.1.45 but local environment uses 1.3.0

- **File**: `package.json:25`, `app/api/Dockerfile:1`, `app/web/Dockerfile:1`, `.github/workflows/ci.yml:35`
- **Current**: All Docker/CI pins specify `1.1.45`. The local `bun` in this environment is `1.3.0` and the project installed cleanly.
- **Recommendation**: Upgrade the pinned Bun version after validating tests in CI, or relax the pin to `1.1.x` / `1.x` if the runtime is not critical.
- **Expected impact**: Avoids CI/runtime drift and picks up security/performance fixes.

### 3.2 Elysia is several minor versions behind

- **File**: `app/api/package.json:21` (`elysia: 1.1.25`)
- **Recommendation**: Evaluate upgrade to Elysia 1.2.x+ and the corresponding `@elysiajs/cors` / `@elysiajs/eden` versions. Review the changelog for breaking route-type changes.
- **Expected impact**: Bug fixes and new plugin ecosystem.

### 3.3 `app/api` build does not produce a deployable artifact

- **File**: `app/api/package.json:12` (`"build": "tsc --noEmit"`)
- **Current**: The API "build" is a typecheck only. The Dockerfile copies TypeScript source and runs `bun src/index.ts` (`app/api/Dockerfile:13`).
- **Problem**: Production images ship source files, `bun.lockb`, and test files (because `.dockerignore` does not exclude them).
- **Recommendation**:
  1. Change the API build to `bun build --target=bun --outdir=dist src/index.ts src/worker.ts` and run `dist/index.js` in production.
  2. Add `.dockerignore` entries for `*.test.ts`, `drizzle/`, `node_modules`, `.git`.
- **Expected impact**: Smaller, faster production images and clearer build/runtime separation.

### 3.4 Database connection pool is hard-coded to 10

- **File**: `app/api/src/db/client.ts:7-11`
- **Current**: `max: 10`, `idle_timeout: 20`, `connect_timeout: 10`.
- **Recommendation**: Move these to environment variables (`DATABASE_POOL_MAX`, `DATABASE_POOL_IDLE_TIMEOUT`, `DATABASE_CONNECT_TIMEOUT`) with defaults.
- **Expected impact**: Tune for load without code changes.

## 4. Developer experience

### 4.1 No lint or format scripts

- **File**: `package.json`
- **Current**: No `lint`, `format`, or `check` scripts. No ESLint or Prettier configuration is present.
- **Recommendation**: Add `biome` or `eslint` + `prettier` with configs per workspace and run them in CI.
- **Expected impact**: Consistent code style and catches common bugs before review.

### 4.2 CI is sequential and lacks caching

- **File**: `.github/workflows/ci.yml:30-41`
- **Current**: Single job; no `actions/cache` for `node_modules` or `~/.bun/install/cache`.
- **Recommendation**:
  1. Cache Bun's install cache.
  2. Split `typecheck`, `test`, and `build` into parallel jobs so failures are isolated and total wall time drops.
  3. Add a `lint` step.
- **Expected impact**: Faster CI feedback and clearer failure attribution.

### 4.3 Worker service has no healthcheck

- **File**: `docker-compose.yml:96-126`
- **Current**: `vocalonix-worker` has no `healthcheck`. Docker will not know if the worker is stuck.
- **Recommendation**: Add a `/api/health` worker-specific endpoint or a liveness probe that checks `outbox_events` processing time, then add a `healthcheck` block.
- **Expected impact**: Orchestrator can restart unhealthy workers.

### 4.4 Migrations run inside the API container CMD

- **File**: `app/api/Dockerfile:13` (`CMD ["sh", "-c", "bun run db:migrate && bun run start"]`)
- **Current**: The API container runs migrations every time it starts.
- **Problem**: A long or failing migration blocks container startup; multiple replicas could race.
- **Recommendation**: Run migrations in an init container or a `Job` in Kubernetes; the API container should only start the server.
- **Expected impact**: Safer deploys and faster container restarts.

### 4.5 No shared validation between frontend and backend

- **Files**: `app/web/src/routes/*.tsx` (zod schemas) and `app/api/src/*/routes.ts` (Elysia `t.Object`)
- **Current**: Sign-up, login, profile, agent, widget, and hours schemas are defined separately in both layers.
- **Problem**: They can drift; e.g. the widget color regex is duplicated and allowed-domains shape differs (string in UI, array in API).
- **Recommendation**: Create a `@vocalonix/schemas` workspace package that exports zod/Elysia-compatible validators, or generate one from the other.
- **Expected impact**: Single source of truth for validation; fewer mismatched errors.

### 4.6 No project-level onboarding file for contributors

- **Current**: `docs/` is comprehensive, but there is no top-level `AGENTS.md` or `CONTRIBUTING.md` summarizing build/test/run conventions.
- **Recommendation**: Add `AGENTS.md` with the commands verified during this audit (`bun install`, `bun run typecheck`, `bun run test`, `bun run build`, `./scripts/setup.sh`, `docker compose up -d --build --wait`).
- **Expected impact**: Faster onboarding for future agents and contributors.

## 5. Security & operational architecture

### 5.1 No rate-limiting or request-size middleware

- **File**: `app/api/src/index.ts:85-110`
- **Current**: CORS and global error handling are registered, but there is no rate-limiting, body-size limit, or request timeout.
- **Recommendation**: Add `@elysiajs/rate-limit` (or Redis-backed custom middleware) and a global `maxBodySize` check. Apply stricter limits to `/api/auth/*` and `/api/b/:slug/invitations`.
- **Expected impact**: Mitigates brute-force and invitation-spam attacks.

### 5.2 Prompt content is interpolated directly into LLM instructions

- **Files**: `app/api/src/dograh/config.ts:53-66`, `app/api/src/dograh/workflow.ts:70-74`
- **Current**: User-provided `agentName`, `businessName`, `greeting`, `prompt`, `closing`, `escalationGuidance` are joined into prompts without sanitization.
- **Problem**: A user with `agent.edit` permission can inject instructions into the agent's global prompt.
- **Recommendation**: Add a prompt-sanitization helper that strips or escapes delimiters like `system:`, `user:`, `assistant:`, and `<<`/`>>` sequences, and validate lengths more conservatively.
- **Expected impact**: Reduces prompt-injection surface; defense in depth.

### 5.3 `dograh/client.ts` requests have a fixed timeout but no retries

- **File**: `app/api/src/dograh/client.ts:11`, `138-167`
- **Current**: 30-second timeout and one auth retry, but no retry for transient 5xx or network errors.
- **Recommendation**: Add an idempotent retry policy for `GET`/`PUT` operations with exponential backoff, limited to `dograh.knowledge.*` outbox handlers to avoid duplicate uploads.
- **Expected impact**: Higher resilience to transient Dograh/storage failures.

## 6. Recommended refactors, ranked by ROI

| Refactor | Effort | Impact | Files |
|---|---|---|---|
| Unify knowledge upload service | < 1 day | High (removes duplication + limit bug) | `index.ts`, `tenant/routes.ts` |
| Replace `<a>`/window.location with router links | < 1 day | High (SPA UX) | `business.tsx`, `tenant.tsx`, `public.tsx`, `account.tsx` |
| Add pagination to list endpoints | 1 day | High (performance) | `workspace/routes.ts`, `tenant/routes.ts`, `dograh/client.ts` |
| Add `@tanstack/react-query` for server state | 2-3 days | High (UX + code simplification) | `app/web/src/routes/*.tsx` |
| Introduce shared `@vocalonix/schemas` package | 1-2 days | Medium (prevents FE/BE drift) | new workspace |
| Convert team grid to semantic `<table>` | < 1 day | Medium (accessibility) | `business.tsx`, `styles.css` |
| Add API build artifact + .dockerignore | 1 day | Medium (deploy hygiene) | `app/api/package.json`, `Dockerfile` |
| Add lint + format + CI split | 1 day | Medium (DX) | root, `.github/workflows/ci.yml` |
| Add auth/workspace/tenant integration tests | 3-5 days | High (coverage) | `app/api/src/**/*.test.ts` |
| Resolve workflow namespace collision | 1-2 days | Critical (isolation) | `dograh/workflow.ts`, `dograh/config.ts`, `dograh/tenant.ts` |
