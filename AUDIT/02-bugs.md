# Vocalonix Bug Audit

## Verification baseline

- `bun install --frozen-lockfile` succeeded (both workspaces).
- `bun run typecheck` passed for `app/api` and `app/web`.
- `bun run test` passed: 23 tests across 6 files.
- `bun run --cwd app/web build` completed with no errors or warnings.
- No runtime integration tests were performed; the findings below are from static analysis of the source code.

---

## Critical

### 1. Secret MVP lab and tenant workflows share the same name prefix

- **File**: `app/api/src/dograh/workflow.ts:5` and `app/api/src/dograh/config.ts:36`
- **Code**:
  ```ts
  // workflow.ts
  const WORKFLOW_PREFIX = "[Vocalonix]";
  ```
  ```ts
  // config.ts
  return `[Vocalonix:${business.id}] ${settings.agentName} for ${business.name}`;
  ```
- **Problem**: `ensureWorkflow()` in `workflow.ts:188-190` finds any workflow whose name `startsWith(WORKFLOW_PREFIX)`. Because tenant workflows also start with `[Vocalonix]`, the secret lab can pick up a tenant-owned workflow. The reverse can happen too. This breaks the isolation promised by the tenant control plane and may cause the secret lab to render or mutate another business's agent settings.
- **Fix**: Give the secret lab a distinct prefix (e.g. `[Vocalonix:lab]`) and have `ensureWorkflow()` search only for that prefix. Tenant workflows already include the business ID, so they are safe from exact-name collisions but not from `startsWith` overlap.
  ```ts
  const WORKFLOW_PREFIX = "[Vocalonix:lab]";
  ```
- **Impact**: Wrong workflow selected, cross-tenant data leakage or corruption in Dograh.

### 2. No pagination on any list endpoint

- **Files**: `app/api/src/workspace/routes.ts` (`GET /api/businesses`, `GET /api/b/:slug/team`, `GET /api/b/:slug/audit-logs`, `GET /api/b/:slug/invitations`), `app/api/src/tenant/routes.ts` (`GET /api/b/:slug/knowledge`), `app/api/src/index.ts` (`GET /api/knowledge`), `app/api/src/dograh/client.ts:237` (`listDocuments` hardcoded `limit=100&offset=0`)
- **Problem**: All list queries return every matching row. A busy workspace with many members, invitations, documents, or audit events will send unbounded payloads to the browser. The Dograh document list is also capped at 100 with no way to retrieve later pages, so documents beyond 100 are invisible.
- **Fix**: Add `limit`/`offset` (or cursor) query parameters to list endpoints and propagate them to the DB queries. For `dograh.listDocuments`, accept `limit`/`offset` or `nextToken` and expose pagination in the UI.
- **Impact**: Denial-of-service via large payloads, UI freeze, silent data loss beyond the first 100 documents.

### 3. Race condition allows a workspace to be left with zero Owners

- **File**: `app/api/src/workspace/routes.ts:613-615` and `app/api/src/workspace/routes.ts:677-678`
- **Code**:
  ```ts
  if (target.role === "Owner" && nextRole !== "Owner") {
    await ensureAnotherOwner(workspace.business.id, params.userId);
  }
  await db.transaction(async (tx) => { ... });
  ```
- **Problem**: `ensureAnotherOwner()` runs outside the subsequent `UPDATE memberships` transaction. Two concurrent requests that each demote/revoke the last two Owners can both pass the check before either transaction commits, leaving zero active Owners.
- **Fix**: Move the ownership check and the membership update into a single serializable transaction, or acquire an advisory lock on the business ID before checking.
  ```ts
  await db.transaction(async (tx) => {
    // re-check inside tx with SELECT ... FOR UPDATE or advisory lock
    const [otherOwner] = await tx
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(...)
      .limit(1);
    if (!otherOwner) throw new ApiError(409, "LAST_OWNER", ...);
    await tx.update(memberships).set(...).where(...);
  });
  ```
- **Impact**: Workspace becomes unmanageable; violates the "at least one Owner" invariant.

---

## High

### 4. Frontend uses `<a href>` and `window.location` for internal navigation

- **Files**: `app/web/src/routes/business.tsx:276-350`, `app/web/src/routes/tenant.tsx:1131-1147`, `app/web/src/routes/public.tsx:172-501`, `app/web/src/routes/account.tsx:74`
- **Problem**: Internal links in `WorkspaceFrame`, `WorkspaceDashboardPage`, `TenantSettingsPage`, auth success screens, and the workspace list are plain `<a>` tags or `window.location.assign/replace` calls. This forces full-page reloads and resets React state, breaking the single-page-app experience.
- **Fix**: Replace internal anchors with `Link` from `@tanstack/react-router` and use `router.navigate` / `navigate` from `useNavigate` for programmatic navigation.
- **Impact**: UX regression, lost form state on navigation, unnecessary network requests.

### 5. Knowledge upload size limits are inconsistent

- **Files**: `app/api/src/index.ts:23` (`MAX_UPLOAD_BYTES = 5 * 1024 * 1024`), `app/web/src/App.tsx:185-199` (MVP lab upload, 5 MB check), `app/api/src/tenant/routes.ts:599` (`body.file.size > 10_000_000`)
- **Problem**: The public `/api/knowledge` and the MVP lab enforce 5 MB, but the tenant-scoped `/api/b/:slug/knowledge` endpoint allows 10 MB. A user uploading through the workspace can exceed the limit the lab expects, and error messages mention different limits.
- **Fix**: Define one constant in `uploads.ts` and use it for both Elysia validation and UI messaging.
  ```ts
  export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // or 5 MB
  ```
- **Impact**: Confusing UX and inconsistent enforcement between tenant and lab flows.

### 6. File type validation only inspects the extension

- **File**: `app/api/src/uploads.ts:11-17`
- **Code**:
  ```ts
  export function fileExtension(filename: string): string {
    return filename.split(".").pop()?.toLowerCase() ?? "";
  }
  export function isAllowedDocumentFilename(filename: string): boolean {
    return ALLOWED_DOCUMENT_EXTENSIONS.has(fileExtension(filename));
  }
  ```
- **Problem**: A file named `invoice.exe.pdf` would pass (`pop()` returns `pdf`), but more importantly an attacker can rename any file to `.pdf` and upload it. The actual MIME type / magic bytes are not verified.
- **Fix**: In addition to extension checks, validate `file.type` against an allow-list and, for documents, inspect file magic bytes (e.g. `%PDF`, `PK` for docx). Reject mismatches.
- **Impact**: Malicious or malformed files can be sent to Dograh storage and processing pipeline.

### 7. `errorDetail` can stringify arbitrary Dograh responses and leak internals

- **File**: `app/api/src/dograh/client.ts:34-41`
- **Code**:
  ```ts
  function errorDetail(value: unknown): string {
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && "detail" in value) {
      const detail = (value as { detail: unknown }).detail;
      return typeof detail === "string" ? detail : JSON.stringify(detail);
    }
    return "Dograh request failed";
  }
  ```
- **Problem**: If Dograh returns a non-string `detail` (e.g. an object containing internal paths, trace IDs, or partially sanitized credentials), `JSON.stringify` forwards the entire object to the end-user error message and server logs.
- **Fix**: Only return a safe, known subset of `detail` and log the raw response server-side without echoing it.
  ```ts
  return typeof detail === "string" ? detail : "Dograh request failed";
  ```
- **Impact**: Information disclosure; stack traces or internal identifiers may reach clients.

### 8. Dograh client silently swallows authentication misconfiguration

- **File**: `app/api/src/dograh/client.ts:97-136`
- **Code**:
  ```ts
  const login = await this.rawRequest<AuthResponse>("/auth/login", ...)
    .catch((error) => { if (error instanceof DograhError && error.status === 401) return null; throw error; });
  const signup = await this.rawRequest<AuthResponse>("/auth/signup", ...)
    .catch((error) => { if (error instanceof DograhError && error.status === 409) return null; throw error; });
  ```
- **Problem**: `loginOrSignup` hides 401 and 409 errors. If the service account password is wrong but signup returns 409 because the account exists, the code falls through to a second login attempt. This can mask persistent authentication failures and retry repeatedly.
- **Fix**: Distinguish "user already exists" from other 409s, and fail fast after the retry with a clear error. Log the underlying failure.
- **Impact**: Silent Dograh auth loops, slow request timeouts, hard-to-debug integration issues.

---

## Medium

### 9. Magic-link consumption has a TOCTOU window

- **File**: `app/api/src/auth/routes.ts:280-338`
- **Code**: The handler `SELECT`s the row, checks state, then attempts an `UPDATE ... SET consumedAt` with `isNull(consumedAt)`. If another request consumes the token between the `SELECT` and `UPDATE`, the second request falls into the re-check branch and returns a less-specific `TOKEN_EXPIRED` instead of `TOKEN_ALREADY_USED`.
- **Problem**: Race condition in a single-use token flow. The conditional `UPDATE` is correct but the fallback logic returns the wrong error code.
- **Fix**: Inside the same transaction, `SELECT ... FOR UPDATE` or return distinct codes by re-reading the row.
- **Impact**: Misleading error messages under concurrency; possible support burden.

### 10. Outbox worker claims events with a select-then-update race

- **File**: `app/api/src/outbox.ts:146-176`
- **Code**:
  ```ts
  const [candidate] = await db.select({ id: outboxEvents.id })...limit(1);
  const [claimed] = await db.update(outboxEvents)...where(eq(id, candidate.id), eq(status, "pending"))...returning();
  ```
- **Problem**: Two workers can select the same candidate before either update runs. The second `UPDATE` returns zero rows, which is handled (`claimed ?? null`), but it wastes a worker cycle and adds latency.
- **Fix**: Use `UPDATE ... SET status='processing' WHERE id = (SELECT id FROM outbox_events WHERE ... ORDER BY ... FOR UPDATE SKIP LOCKED) ... RETURNING` in a single statement if the Postgres driver supports it, or wrap the select/update in an advisory lock.
- **Impact**: Duplicate work and contention as worker count scales.

### 11. Worker process cannot shut down gracefully

- **File**: `app/api/src/worker.ts:12-15`
- **Code**:
  ```ts
  while (true) {
    const processed = await processNextOutboxEvent();
    if (!processed) await Bun.sleep(idleDelayMs);
  }
  ```
- **Problem**: The worker has no signal handling (`SIGTERM`, `SIGINT`). During a deploy or `docker compose down` the process may be killed mid-event, leaving an `outbox_events` row stuck in `processing` until the 5-minute recovery window.
- **Fix**: Add `Bun.sleep` with an abortable `AbortController` that listens for `process.on('SIGTERM', ...)`, finish the current event, then exit.
- **Impact**: Stuck outbox events during redeploys, delayed processing.

### 12. `invitePreviewUrl` always uses the first configured origin

- **File**: `app/api/src/workspace/routes.ts:67-69` and `app/api/src/env.ts:184`
- **Code**:
  ```ts
  function invitePreviewUrl(token: string): string {
    return new URL(`/invite/${token}`, env.appOrigin).toString();
  }
  ```
- **Problem**: `env.appOrigin` is `appOrigins[0]`. If `APP_ORIGIN` contains multiple origins, invitation preview links always point to the first one, which may not be the origin the admin is using.
- **Fix**: Use the `Origin` header from the request, or include the origin in the preview response and let the frontend build the URL.
- **Impact**: Broken invitation links in multi-origin deployments.

### 13. Workspace deletion does not revoke active memberships

- **File**: `app/api/src/tenant/routes.ts:725-850` (delete business route)
- **Problem**: The route sets `businesses.deletedAt` and queues offboarding, but `memberships.status` remains `active`. Although `requireWorkspace` filters by `isNull(businesses.deletedAt)`, the membership rows stay active forever and could surface in analytics or audit exports.
- **Fix**: Update all memberships for the business to `status='revoked'` and set `revokedAt` inside the delete transaction.
- **Impact**: Data integrity / stale active memberships after deletion.

---

## Low

### 14. `requireWorkspace` returns 404 instead of 403 for non-members

- **File**: `app/api/src/workspace/context.ts:17-46`
- **Code**:
  ```ts
  if (!workspace) {
    throw new ApiError(404, "WORKSPACE_NOT_FOUND", "Workspace not found.");
  }
- **Problem**: A user who is not a member of an existing workspace gets the same response as a workspace that does not exist. This is a minor security-through-obscurity issue but leaks less information. However, callers cannot distinguish "not a member" from "not found".
- **Fix**: Decide on a consistent policy. If users should know they lack access, return `403`; otherwise keep `404` and document it.
- **Impact**: Minor UX for API consumers; no functional bug.

### 15. Magic-link `returnTo` can encode a long URL

- **File**: `app/api/src/auth/routes.ts:127-132` and `app/web/src/routes/public.tsx:31-45`
- **Problem**: `returnTo` is validated with `t.String({ maxLength: 2048 })` and `safeReturnTo` rejects `//` and `\\`, but the `intendedRoute` helper on the frontend runs at render time and the value is injected into an `<a href>` without `encodeURIComponent` in some places (`public.tsx:289`). A long or weird value could overflow a URL length limit or create a malformed link.
- **Fix**: Use `encodeURIComponent` consistently when building query strings and trim `returnTo` to a safe maximum.
- **Impact**: Edge-case URL corruption.

### 16. `MagicLinkCallback` and `VerifyEmailPage` use a mutable `started` ref

- **Files**: `app/web/src/routes/public.tsx:383-485`
- **Problem**: The `started` ref prevents double-invocation under `StrictMode` but is not tied to the component lifecycle. If `token` changes, the ref stays `true` and the new token is never consumed.
- **Fix**: Use `useEffect` dependencies properly and reset the guard when `token` changes, or use `useMutation`/`react-query`.
- **Impact**: Edge case if a user navigates from one magic-link URL to another without unmounting the route.

### 17. Secret lab `TestAgent` does not cancel the in-flight `api.getWidget()` promise

- **File**: `app/web/src/App.tsx:49-91`
- **Code**:
  ```ts
  api.getWidget().then((payload) => {
    if (cancelled) return;
    setWidget(payload);
    ...
  });
  ```
- **Problem**: `cancelled` is only checked after the promise resolves. The promise itself continues running and may set widget state after unmount, or append the script after the cleanup has run.
- **Fix**: Use an `AbortController` or a `useEffect` cleanup that ignores the result. Better still, move widget loading into `react-query` with cancellation.
- **Impact**: Minor memory/late-state leak; rare visual glitch on fast navigation.

### 18. Polling intervals keep running when the tab is backgrounded

- **Files**: `app/web/src/App.tsx:167-183` (`KnowledgeBase`), `app/web/src/routes/tenant.tsx:587-603` (`KnowledgeManager`)
- **Code**:
  ```ts
  useEffect(() => { if (!processing) return; const interval = window.setInterval(() => void load(), 4_000); ... }, [load, processing]);
  ```
- **Problem**: Document-processing polling continues every 4 seconds even when the tab is hidden, consuming battery and network.
- **Fix**: Use `document.visibilityState` or `requestAnimationFrame` scheduling, or double the interval when hidden.
- **Impact**: Unnecessary background polling.

### 19. `AuthProvider` `logout` falls back to local state without waiting for the server

- **File**: `app/web/src/auth/AuthProvider.tsx:74-78`
- **Code**:
  ```ts
  logout: async () => {
    await api.auth.logout();
    setSession(null);
    setStatus("unauthenticated");
  },
  ```
- **Problem**: If `api.auth.logout()` fails (network), the user is still marked unauthenticated locally while the server session remains valid.
- **Fix**: Set state only after the API call resolves, and show an error if it fails.
- **Impact**: Inconsistent auth state during network errors.

### 20. `tenant/routes.ts` widget allowed-domains validation permits `localhost` in production

- **File**: `app/api/src/tenant/routes.ts:122-145`
- **Code**:
  ```ts
  if (value === "localhost" || value === "127.0.0.1") return value;
  ```
- **Problem**: `normalizeDomains` always accepts `localhost` and `127.0.0.1`, even when `NODE_ENV=production` and `APP_ORIGIN` is a real domain. This makes it possible to generate a widget token usable on `localhost` in production.
- **Fix**: Reject loopback origins in production unless explicitly allowed by env, or gate them behind a `NODE_ENV` check.
- **Impact**: Low-probability misconfiguration; token could be pasted into a local page.

---

## What I could not verify

- No live Dograh instance was available, so Dograh API integration behavior, voice-call flows, and real upload/processing flows were not exercised.
- CI was not run; I rely on local `bun run typecheck`/`test`/`build`.
- No end-to-end browser testing was performed, so responsive breakpoints and exact focus/touch-target behavior are inferred from CSS and component code.
- No dependency vulnerability scan was run; the dependency versions listed are from `package.json` and `bun.lockb` was not audited for advisories.
