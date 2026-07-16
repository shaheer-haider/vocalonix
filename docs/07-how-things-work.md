# How things work

## Authentication and session mechanics

The API uses `better-auth` (`app/api/src/auth/config.ts:10`) with the Drizzle adapter and a Postgres database. The cookie is called `vocalonix_session` and is configured as `httpOnly`, `sameSite: "lax"`, `secure: env.isProduction`, `path: "/"` (`auth/config.ts:47`).

Sessions are stored server-side in the `sessions` table. The browser never sees the session token value; it only receives the `vocalonix_session` cookie. Session lifetime is 30 days (`auth/config.ts:40`), with `updateAge` 24 hours and `freshAge` 10 minutes.

The frontend `AuthProvider` (`app/web/src/auth/AuthProvider.tsx:31`) is a React context. On mount it calls `api.auth.session()` and stores the result. It exposes `login`, `logout`, `logoutAll`, and `refresh`. The route guards in `router.tsx` call `api.auth.session()` directly in `beforeLoad` and redirect to `/login` with the full current URL as `?redirect=` if no session.

Magic links and verification links are captured using `AsyncLocalStorage` (`app/api/src/auth/email.ts:14`). The `sendMagicLink` and `sendVerificationEmail` callbacks run inside `captureAuthLinks`, which writes the constructed local URL to the async store. The route handler then reads the store and returns it as `previewUrl` in non-production environments. This design lets local development show the link without a real email provider.

## CORS and origin handling

The Elysia app registers `@elysiajs/cors` at the top of the chain (`app/api/src/index.ts:86`):

```ts
.use(
  cors({
    origin: env.appOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type"],
    credentials: true,
  }),
)
```

`env.appOrigins` is a parsed array from `APP_ORIGIN` (`app/api/src/env.ts:184`). The `PATCH` method is explicitly allowed because the team role update uses `PATCH` (`workspace/routes.ts:579`).

## Dograh client authentication

The `DograhClient` (`app/api/src/dograh/client.ts:79`) supports two ways of authenticating to Dograh:

1. **Static API key** — if `DOGRAH_API_KEY` is set, it is sent as `X-API-Key` on every request.
2. **Service account** — if no API key is set, the client logs in with `DOGRAH_SERVICE_EMAIL` and `DOGRAH_SERVICE_PASSWORD`, caches the returned `sessionToken`, and sends it as `Authorization: Bearer <token>`.

The login flow is `loginOrSignup` (`dograh/client.ts:97`):

```ts
private async loginOrSignup(): Promise<string> {
  const login = await this.rawRequest("/auth/login", { ... }).catch(...401 => null);
  if (login) return login.token;
  const signup = await this.rawRequest("/auth/signup", { ... }).catch(...409 => null);
  if (signup) return signup.token;
  const retry = await this.rawRequest("/auth/login", { ... });
  return retry.token;
}
```

This is important: if the service account does not exist yet, the client creates it. That means the first request to a fresh Dograh instance will auto-provision the `vocalonix@vocalonix.ai` service account.

If a 401 is returned on an authenticated request, the client clears the cached token and retries once (`dograh/client.ts:169`).

## Tenant Dograh synchronization

The sync engine is the most complex piece of the API. Its goal is to make Dograh match the Vocalonix tenant state exactly.

### Desired state

`tenantDesiredConfiguration` (`app/api/src/dograh/config.ts:187`) builds:

1. A workflow name of the form `[Vocalonix:<businessId>] <agentName> for <businessName>`.
2. A workflow definition with four nodes (`globalNode`, `startCall`, `agentNode`, `endCall`) and three edges.
3. `workflowConfigurations` with `max_call_duration`, `turn_start_strategy`, and `allow_interrupt` derived from `allowInterrupt`.
4. A SHA-256 hash of the sorted configuration object.

The hash is deterministic: `stableConfigurationHash` sorts object keys and document UUIDs before hashing (`dograh/config.ts:26`). This means reordering the same documents does not trigger a sync.

### Decision logic

`synchronizationDecision` (`app/api/src/dograh/tenant.ts:117`) returns one of:

- `no-op` — already synced to the same hash.
- `rejected` — last attempt was rejected and the config has not changed.
- `synchronize` — something changed or a manual retry forced it.

### Lease

The sync claims a five-minute lease by updating `business_dograh_mappings` with `syncLeaseId` and `syncLeaseExpiresAt` only when the existing lease is null or expired (`dograh/tenant.ts:221`). If another process holds the lease, the caller receives `This business is already synchronizing`.

### Workflow ownership

When re-syncing an existing `workflowId`, the engine reads the workflow definition and checks `metadata.vocalonix.business_id` (`dograh/tenant.ts:143`). If it does not match the current business, it throws `409` to prevent cross-tenant corruption.

### Failure classification

`classifyDograhFailure` (`app/api/src/dograh/errors.ts:25`) maps Dograh HTTP status codes to categories:

- `401`/`403` → `unauthorized` (non-retryable)
- `404` → `not_found` (non-retryable)
- `408`/`429`/`>=500` → `unreachable` (retryable)
- `400-499` → `rejected` (non-retryable)

The message sanitiser strips URLs and credential-like strings before storing the message in the database.

## Outbox retry and polling

The outbox is a single-table job queue in the same Postgres database (`app/api/src/outbox.ts:254`).

- `claimNextEvent` selects the oldest pending event, atomically setting `status='processing'` and incrementing `attemptCount`.
- `handleEvent` dispatches to the right handler.
- If a handler returns `{ retryAfterMs }` (e.g. knowledge still processing), `pollRescheduleUpdate` resets `attemptCount` to 0 and sets `availableAt` to a future time. This is a deliberate design choice: polling a healthy-but-slow operation does not consume the retry budget (`outbox.test.ts:16`).
- If a handler throws, `failureUpdate` uses exponential backoff (`5s * 2^(attemptCount-1)` capped at 5 minutes) and keeps `status='pending'` while `attemptCount < maxAttempts` (default 8). Non-retryable errors immediately become `failed`.

The worker starts by recovering events stuck in `processing` for more than 5 minutes (`recoverStuckOutboxEvents`) and sync leases that expired (`recoverStuckBusinessSyncs`).

## Permissions model

The server enforces roles in `app/api/src/workspace/permissions.ts:28`:

```ts
export function can(role: Role, permission: Permission): boolean {
  return matrix[permission].includes(role);
}
```

Roles ranked: Owner (5), Admin (4), Manager (3), Staff (2), Viewer (1). `canManageRole` returns true only if `roleRank[actor] > roleRank[target]` or the actor is `Owner` (`workspace/permissions.ts:32`).

The same matrix is duplicated in `app/web/src/permissions.ts:20` to hide UI controls, but the server is authoritative. The client-side check is only a convenience.

## Widget script and embed token

The browser loads Dograh's public widget from `/embed/dograh-widget.js` on the Vocalonix host. The Vite dev server serves this file from `dograh/ui/public/embed/dograh-widget.js` (`app/web/vite.config.ts:16`), and the production build copies it into `dist/embed/`.

The widget script needs a token. The API creates an embed token via `dograh.createEmbedToken(workflowId, settings, allowedDomains)` and returns a script URL like:

```
http://localhost:3000/embed/dograh-widget.js?token=<token>&environment=local&apiEndpoint=http://localhost:8000
```

The embed token is scoped to the workflow and allowed domains. The Dograh management credentials are never in the URL.

## Environment validation

`app/api/src/env.ts:159` validates the environment at import time. If validation fails, the process exits with `console.error("Invalid environment", ...)` before any routes are mounted. The production-mode refinements (`env.ts:33`) enforce:

- `AUTH_SECRET` must not be the dev default.
- `RESEND_API_KEY` must be set.
- `API_PUBLIC_URL` must use `https:`.
- Every `APP_ORIGIN` must use `https:`.
- `EMAIL_FROM` must contain `@`.
- `DOGRAH_API_KEY` or a non-default `DOGRAH_SERVICE_PASSWORD` must be set.
- `REQUIRE_EMAIL_VERIFICATION` must be `true`.

## Knowledge lifecycle

A knowledge source has states `pending`, `uploading`, `processing`, `active`, `failed`, `delete_pending`, `deleted` (`app/api/src/db/schema.ts:165`).

1. API creates a `business_knowledge` row with `state='pending'` and inserts `outbox_events` `dograh.knowledge.upload`.
2. Worker calls `uploadKnowledgeSource` (`dograh/tenant.ts:400`): requests a presigned URL, uploads bytes to MinIO, processes the document, then updates state to `processing`.
3. Worker calls `reconcileKnowledge` (`dograh/tenant.ts:478`): polls Dograh until the document status is `completed` (or `failed`).
4. When completed, it calls `synchronizeBusiness` with `extraDocumentUuid` to attach the new document to the workflow, then sets `state='active'`, `active=true`.
5. If a `replacementId` is set, the old knowledge row is marked `delete_pending` and a cleanup sync is queued.

Deletion works in the opposite order: active knowledge is first marked `delete_pending` and a workflow sync removes it from the workflow; only then is the remote document deleted.

## Two workflow paths

The codebase currently has two Dograh workflow managers:

1. **`dograh/workflow.ts`** — legacy single-workflow manager for the unprotected `/secret/*` lab. It searches for any workflow whose name starts with `[Vocalonix]` and creates one if missing. It is used by `GET /api/agent`, `PUT /api/agent`, etc. (`app/api/src/index.ts:128`).
2. **`dograh/tenant.ts`** — tenant-scoped manager for `/app/:businessSlug`. It creates workflows named `[Vocalonix:<businessId>] ...` and stores the mapping in `business_dograh_mappings`.

The two paths are intentionally separate. The tenant path is the future architecture; the legacy path is the current MVP lab.

