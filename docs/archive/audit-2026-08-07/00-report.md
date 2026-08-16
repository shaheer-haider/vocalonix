# Vocalonix Audit Report

## Executive Summary

Vocalonix is a well-structured Bun + Elysia + React SPA that wraps a self-hosted Dograh voice platform. The repo has real authentication, multi-business workspaces, role-based permissions, invitations, tenant onboarding, knowledge uploads, and Dograh workflow synchronization. Static checks passed: `bun install`, typecheck, all 23 API tests, and the Vite production build all succeeded. The most serious issues are architectural: the secret MVP lab and tenant workflows share a `[Vocalonix]` name prefix and can collide; list endpoints have no pagination; and frontend navigation uses `<a>` tags / `window.location` that force full-page reloads. Several race conditions around last-Owner checks and outbox event claiming are present but not immediately exploitable. UI/UX is polished visually but has inconsistent empty states, unconfirmed destructive actions, and missed accessibility opportunities. Test coverage is limited to utility files, leaving the auth, workspace, tenant, and Dograh integration paths unverified.

## Top 10 Issues (ranked by impact × ease of fix)

1. **Secret lab and tenant workflows share the same `[Vocalonix]` prefix**
   - **Files**: `app/api/src/dograh/workflow.ts:5`, `app/api/src/dograh/config.ts:36`, `app/api/src/dograh/workflow.ts:187-190`
   - **Why it matters**: `ensureWorkflow()` finds any workflow starting with `[Vocalonix]`, so the unprotected secret lab can accidentally read or mutate a tenant workflow.
   - **Effort**: Medium; **Impact**: Critical.

2. **No pagination on any list endpoint**
   - **Files**: `app/api/src/workspace/routes.ts:131-157` (businesses), `296-336` (team), `809-845` (audit logs), `app/api/src/tenant/routes.ts:549-577` (knowledge), `app/api/src/dograh/client.ts:237` (documents)
   - **Why it matters**: Unbounded responses and the first 100 Dograh documents are silently hidden.
   - **Effort**: Medium; **Impact**: High.

3. **Frontend uses `<a>` and `window.location` for internal navigation**
   - **Files**: `app/web/src/routes/business.tsx:276-350`, `app/web/src/routes/tenant.tsx:1131-1147`, `app/web/src/routes/public.tsx:439-502`, `app/web/src/routes/account.tsx:72-83`
   - **Why it matters**: Forces full-page reloads, resets React state, and breaks SPA expectations.
   - **Effort**: Low; **Impact**: High.

4. **Race condition can leave a workspace with zero Owners**
   - **Files**: `app/api/src/workspace/routes.ts:613-615`, `677-678`, `104-128`
   - **Why it matters**: `ensureAnotherOwner()` runs outside the membership update transaction; two concurrent demotions can pass the check before either commits.
   - **Effort**: Medium; **Impact**: High.

5. **Knowledge upload size limits are inconsistent (5 MB vs 10 MB)**
   - **Files**: `app/api/src/index.ts:23`, `app/web/src/App.tsx:185-199`, `app/api/src/tenant/routes.ts:599`
   - **Why it matters**: Different flows enforce different limits, creating confusing errors.
   - **Effort**: Very low; **Impact**: Medium.

6. **File upload validation only checks file extension**
   - **Files**: `app/api/src/uploads.ts:11-17`
   - **Why it matters**: Any file can be renamed to `.pdf` and uploaded to Dograh storage/processing.
   - **Effort**: Low; **Impact**: Medium.

7. **`errorDetail` can stringify arbitrary Dograh responses into user-facing errors**
   - **Files**: `app/api/src/dograh/client.ts:34-41`
   - **Why it matters**: Internal paths, trace IDs, or partially-sanitized details can leak to clients.
   - **Effort**: Very low; **Impact**: Medium.

8. **No confirmation for destructive role/member/knowledge actions**
   - **Files**: `app/web/src/routes/business.tsx:686-704`, `app/web/src/routes/tenant.tsx:776-790` (truncated), `app/web/src/routes/account.tsx:207-213`
   - **Why it matters**: One-click role change, member revocation, and knowledge deletion are irreversible and high-stakes.
   - **Effort**: Low; **Impact**: Medium.

9. **Outbox worker has no graceful shutdown or healthcheck**
   - **Files**: `app/api/src/worker.ts:12-15`, `docker-compose.yml:96-126`
   - **Why it matters**: Deploys can kill the worker mid-event, leaving events stuck in `processing` for 5 minutes; Docker cannot detect a stuck worker.
   - **Effort**: Low; **Impact**: Medium.

10. **No integration tests for auth, workspace, tenant, or Dograh flows**
    - **Files**: `app/api/src/auth/routes.ts`, `app/api/src/workspace/routes.ts`, `app/api/src/tenant/routes.ts`, `app/api/src/dograh/client.ts`
    - **Why it matters**: The most security- and revenue-sensitive paths are unverified; regressions are likely as the product grows.
    - **Effort**: Large; **Impact**: High.

## Prioritized Implementation Roadmap

### Quick wins (< 1 hour each)

1. **Fix knowledge upload size inconsistency** — define `MAX_UPLOAD_BYTES` in `uploads.ts` and use it in both `index.ts` and `tenant/routes.ts`.
2. **Remove internal `<a>` navigation** — replace with `Link`/`useNavigate` in `business.tsx`, `tenant.tsx`, `public.tsx`, and `account.tsx`.
3. **Harden `errorDetail`** — only echo string `detail`; log raw objects server-side.
4. **Add confirmation modals** — wrap member revoke, role change, knowledge delete, and "log out everywhere" in the existing `Modal` component.
5. **Fix `ColorField` text input `aria-invalid`** — pass `aria-invalid` and `aria-describedby` to the hex text input.
6. **Add `AGENTS.md`** with verified build/test commands.

### Medium tasks (< 1 day each)

1. **Unify knowledge upload service** — extract a shared `saveKnowledge()` function and call it from both `/api/knowledge` and `/api/b/:slug/knowledge`.
2. **Add `localhost` production guard in `normalizeDomains`** — reject loopback domains unless `NODE_ENV !== "production"`.
3. **Move last-Owner check inside the transaction** — use `SELECT ... FOR UPDATE` or an advisory lock in `workspace/routes.ts`.
4. **Fix outbox event-claim race** — combine select and update, or add an advisory lock.
5. **Add graceful shutdown to the worker** — listen for `SIGTERM`/`SIGINT`, finish the current event, then exit.
6. **Add worker healthcheck to `docker-compose.yml`** and separate migrations into an init container/job.
7. **Improve responsive breakpoints** — collapse the workspace sidebar at 980 px and add overflow protection for the secret lab sidebar.
8. **Convert team table to semantic `<table>`** for screen readers.

### Large refactors (< 1 week each)

1. **Resolve workflow namespace collision** — give the secret lab a distinct prefix and centralize workflow creation in `dograh/tenant.ts`.
2. **Add pagination to all list endpoints** — implement `limit`/`offset` in backend, propagate to UI, and expose Dograh document pagination.
3. **Adopt `@tanstack/react-query` for server state** — replace per-route `useEffect`/`useState` patterns with cached queries/mutations.
4. **Create `@vocalonix/schemas` workspace** — share validation between frontend zod and backend Elysia types.
5. **Add integration tests** — auth, workspace, tenant, Dograh client, and outbox worker flows against a test Postgres.
6. **Build API artifacts** — change `app/api` build to produce `dist/`, update Dockerfile, and prune test/source files from production images.

## What I Could Not Verify

- No live Dograh instance was available, so voice-call flows, real upload/processing, and Dograh API responses were not exercised.
- The Docker Compose stack was not started, so runtime health, worker behavior under load, and inter-service networking were not tested.
- End-to-end browser interaction (responsive breakpoints, focus management, actual screen readers) was not tested; accessibility findings are from code inspection.
- No dependency vulnerability scan or license audit was run.
- CI was not executed; I relied on local `bun install`, `bun run typecheck`, `bun run test`, and `bun run --cwd app/web build`, all of which passed.
