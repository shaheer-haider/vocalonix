# API reference

All routes are served by `app/api/src/index.ts:85` under the base path `http://localhost:3001/api`. The API uses Elysia with the body schemas shown below. Errors are returned as `{ error: string, code?: string }` with an appropriate HTTP status (`app/api/src/index.ts:94`).

## Health and status

### `GET /api/health`

No auth.

- **Purpose**: liveness check.
- **Response**:
  ```json
  { "status": "ok", "service": "vocalonix-api", "time": "2026-07-15T..." }
  ```

### `GET /api/dograh/status`

No auth.

- **Purpose**: Check Dograh connectivity and the legacy `[Vocalonix]` workflow.
- **Response**:
  ```json
  {
    "connected": true,
    "health": { "status": "ok", "version": "1.41.0" },
    "workflow": { "id": 1, "name": "[Vocalonix] Nova", "status": "active" }
  }
  ```

## Authentication

All `/api/auth/*` routes are defined in `app/api/src/auth/routes.ts:80`.

### `POST /api/auth/signup`

No auth.

- **Body** (`auth/routes.ts:127`):
  ```json
  { "name": "Alice", "email": "alice@example.com", "password": "password", "returnTo?": "/app" }
  ```
- **Response**:
  ```json
  {
    "user": { "id": "...", "name": "Alice", "email": "alice@example.com", "emailVerified": true },
    "requiresVerification": false,
    "verificationPreviewUrl": null
  }
  ```
- **Errors**: `400` validation, `409` duplicate user, `500` signup failure.

### `POST /api/auth/login`

No auth.

- **Body** (`auth/routes.ts:164`):
  ```json
  { "email": "alice@example.com", "password": "password", "rememberMe?": false }
  ```
- **Response**:
  ```json
  { "user": { "id": "...", "name": "Alice", "email": "...", "emailVerified": true } }
  ```
- **Errors**: `401` invalid credentials, `400` validation.

### `GET /api/auth/session`

Session cookie.

- **Response**:
  ```json
  { "session": { "user": { ... }, "session": { "id", "createdAt", "updatedAt", "expiresAt" } } }
  ```
- **Errors**: `401` if no session; response may be `null` on failure (not error).

### `POST /api/auth/refresh`

Session cookie.

- Same response shape as `GET /api/auth/session` but forces `disableCookieCache: true`.

### `POST /api/auth/logout`

Session cookie.

- **Response**: `{ success: true }`
- **Side effect**: clears `vocalonix_session` cookie.

### `POST /api/auth/logout-all`

Session cookie.

- **Response**: `{ success: true }`
- **Side effect**: deletes all `sessions` rows for the current user.

### `GET /api/auth/sessions`

Session cookie.

- **Response**: `{ sessions: [{ id, createdAt, updatedAt, expiresAt, ipAddress, userAgent, current }] }`

### `POST /api/auth/magic/request`

No auth.

- **Body** (`auth/routes.ts:274`):
  ```json
  { "email": "alice@example.com", "returnTo?": "/app" }
  ```
- **Response**: `{ success: true, previewUrl: "http://localhost:3000/magic?token=..." }` (preview only when `NODE_ENV !== production`).
- **Errors**: `400` validation, `500` on failure.

### `POST /api/auth/magic/consume`

No auth.

- **Body** (`auth/routes.ts:363`):
  ```json
  { "token": "..." }
  ```
- **Response**: `{ success: true, user: { ... } }`
- **Errors**: `400` invalid token, `409` already used, `410` expired.

### `POST /api/auth/email/verify`

No auth.

- **Body** (`auth/routes.ts:385`):
  ```json
  { "token": "..." }
  ```
- **Response**: `{ success: true }`
- **Errors**: `400` on failure.

## Workspaces

All `/api/businesses*` and `/api/b/*` routes are defined in `app/api/src/workspace/routes.ts:130`.

### `GET /api/businesses`

Session cookie.

- **Response**:
  ```json
  {
    "businesses": [
      { "id": "...", "slug": "...", "name": "...", "initial": "A", "city": "...", "country": "US", "timezone": "America/New_York", "role": "Owner", "joinedAt": "..." }
    ]
  }
  ```

### `POST /api/businesses`

Session cookie.

- **Body** (`workspace/routes.ts:269`):
  ```json
  { "name": "Acme", "slug": "acme", "country?": "US", "timezone?": "America/New_York", "city?": "Austin", "contactEmail?": "a@a.com", "vertical?": "Services", "locations?": "1" }
  ```
- **Response**: `{ business: { id, slug, name, initial, city, country, timezone, role } }`
- **Errors**: `400` invalid slug/name, `409` slug taken.

### `GET /api/b/:slug`

Session cookie; active membership required.

- **Response**: `{ business: { id, slug, name, initial, city, country, timezone, role } }`
- **Errors**: `401`, `404` workspace not found.

### `GET /api/b/:slug/team`

Session cookie; `team.manage` permission.

- **Response**: `{ members: [...], invitations: [...] }`
- **Errors**: `403` missing permission.

### `POST /api/b/:slug/invitations`

Session cookie; `team.manage` permission.

- **Body** (`workspace/routes.ts:462`):
  ```json
  { "email": "bob@example.com", "role": "Admin" }
  ```
- **Response**: `{ invitation: { id, email, role, previewUrl } }`
- **Errors**: `403` not manageable, `409` already member / pending invitation.

### `POST /api/b/:slug/invitations/:invitationId/revoke`

Session cookie; `team.manage` permission.

- **Response**: `{ success: true }`
- **Errors**: `404` pending invitation not found.

### `POST /api/b/:slug/invitations/:invitationId/resend`

Session cookie; `team.manage` permission.

- **Response**: `{ success: true, previewUrl: "..." }`
- **Errors**: `404` pending invitation not found.

### `PATCH /api/b/:slug/team/:userId`

Session cookie; `team.manage` permission.

- **Body** (`workspace/routes.ts:642`):
  ```json
  { "role": "Manager" }
  ```
- **Response**: `{ success: true }`
- **Errors**: `403` cannot assign role, `404` member not found, `409` last owner.

### `DELETE /api/b/:slug/team/:userId`

Session cookie; `team.manage` permission.

- **Response**: `{ success: true }`
- **Errors**: `403` cannot remove, `404` not found, `409` last owner.

### `GET /api/invitations/:token`

No auth.

- **Response**:
  ```json
  { "state": "valid", "invitation": { "id", "businessName", "businessSlug", "email", "expiresAt", "inviterName", "role" } }
  ```
  Possible `state` values: `invalid`, `valid`, `expired`, `revoked`, `accepted`.

### `POST /api/invitations/:token/accept`

Session cookie.

- **Response**: `{ success: true, businessSlug: "..." }`
- **Errors**: `404` invalid invitation, `410` expired, `409` already accepted/revoked, `403` email mismatch, `409` already a member.

## Tenant settings

All `/api/b/:slug/*` routes below are defined in `app/api/src/tenant/routes.ts:153`.

### `GET /api/b/:slug/settings`

Session cookie; active membership.

- **Response**:
  ```json
  {
    "business": { "id", "slug", "name", "city", "country", "timezone", "contactEmail", "vertical", "role" },
    "settings": { "agentName", "greeting", "prompt", "closing", "tone", "voice", "allowInterrupt", "escalationGuidance", "businessHours", "widgetButtonText", "widgetColor", "allowedDomains" },
    "onboarding": { "completedSteps", "currentStep", "publishedAt" },
    "dograh": { "workflowId", "workflowUuid", "configVersion", "configHash", "syncedConfigHash", "syncState", "errorCategory", "lastError", "lastAttemptAt", "lastSuccessAt" }
  }
  ```

### `PUT /api/b/:slug/settings/profile`

Session cookie; `agent.edit` permission.

- **Body** (`tenant/routes.ts:249`):
  ```json
  { "name": "Acme", "city?": "Austin", "country": "US", "timezone": "America/New_York", "contactEmail?": "a@a.com", "vertical?": "Services" }
  ```
- **Response**: `{ ok: true }`

### `PUT /api/b/:slug/settings/agent`

Session cookie; `agent.edit` permission.

- **Body** (`tenant/routes.ts:304`):
  ```json
  { "agentName": "Nova", "greeting": "...", "prompt": "...", "closing": "...", "tone": "warm", "voice": "natural", "allowInterrupt": true, "escalationGuidance": "..." }
  ```
- **Response**: `{ ok: true }`

### `PUT /api/b/:slug/settings/hours`

Session cookie; `agent.edit` permission.

- **Body** (`tenant/routes.ts:345`):
  ```json
  { "businessHours": { "Monday": { "enabled": true, "open": "09:00", "close": "17:00" } } }
  ```
- **Response**: `{ ok: true }`

### `PUT /api/b/:slug/settings/widget`

Session cookie; `agent.edit` permission.

- **Body** (`tenant/routes.ts:389`):
  ```json
  { "widgetButtonText": "Talk to us", "widgetColor": "#5b5bd6", "allowedDomains": ["example.com"] }
  ```
- **Response**: `{ ok: true }`

### `POST /api/b/:slug/onboarding/knowledge/complete`

Session cookie; `knowledge.manage` permission.

- **Response**: `{ ok: true }`

### `GET /api/b/:slug/dograh`

Session cookie.

- **Response**: `{ dograh: { ... mapping row } }`

### `POST /api/b/:slug/dograh/retry`

Session cookie; `agent.edit` permission.

- **Response**: `{ result: { hash, noOp, workflowId, workflowUuid } }`

### `POST /api/b/:slug/publish`

Session cookie; `agent.edit` permission.

- **Response**: `{ widget: { workflowId, scriptUrl, snippet, settings } }`
- **Errors**: `409`/`403` if not allowed, `502`/`503`/`422` Dograh errors.

### `GET /api/b/:slug/widget`

Session cookie.

- **Response**: `{ workflowId, scriptUrl, snippet, settings }`
- **Errors**: `409 WIDGET_NOT_PUBLISHED` if mapping not synced or embed token inactive.

### `GET /api/b/:slug/knowledge`

Session cookie.

- **Response**: `{ knowledge: [...] }`

### `POST /api/b/:slug/knowledge`

Session cookie; `knowledge.manage` permission.

- **Body** (`tenant/routes.ts:728`):
  ```json
  { "kind": "document|text|website_reference", "title": "...", "text?": "...", "websiteUrl?": "...", "file?": <File>, "retrievalMode": "chunked|full_document", "replacementId?": "..." }
  ```
- **Response**: `{ knowledgeId: "..." }`
- **Errors**: `400` missing file/text/URL, `413` file too large, `404` replacement not found.

### `DELETE /api/b/:slug/knowledge/:knowledgeId`

Session cookie; `knowledge.manage` permission.

- **Response**: `{ ok: true }`
- **Errors**: `404` knowledge not found.

### `DELETE /api/b/:slug`

Session cookie; `business.delete` permission (Owner only).

- **Response**: `{ ok: true }`
- **Side effect**: soft-deletes `businesses` and queues `dograh.business.offboard`.

## Public single-workflow lab (MVP)

Routes in `app/api/src/index.ts:85` that are not prefixed by `auth`, `tenant`, or `workspace`. These are used by `/secret/*` and are intentionally unauthenticated.

### `GET /api/agent`

No auth.

- **Response**: `{ workflow: { id, name, status }, settings: { ... }, defaults: { ... } }`

### `PUT /api/agent`

No auth.

- **Body** (`index.ts:156`):
  ```json
  { "agentName": "...", "businessName": "...", "greeting": "...", "prompt": "...", "closing": "...", "allowInterrupt": true, "widgetButtonText": "...", "widgetColor": "#5b5bd6" }
  ```
- **Response**: `{ workflow, settings }`

### `GET /api/agent/widget`

No auth.

- **Response**: `{ workflowId, scriptUrl, snippet, settings }`

### `GET /api/knowledge`

No auth.

- **Response**: `{ documents: [...] }`

### `POST /api/knowledge`

No auth.

- **Body** (`index.ts:201`):
  ```json
  { "file": <File>, "retrievalMode": "full_document|chunked" }
  ```
- **Response**: `{ document: { ... } }`

### `DELETE /api/knowledge/:documentUuid`

No auth.

- **Response**: `{ ok: true }`

