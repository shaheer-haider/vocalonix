# Vocalonix System Map

## 1. Repository Layout

```text
/Users/muhammadshaheerhaider/Github/vocalonix
├── app/
│   ├── api/                # Elysia + Drizzle backend
│   └── web/                # React + Vite + TanStack Router frontend
├── dograh/                 # Git submodule (Dograh v1.41.0 voice platform)
├── docs/                   # Architecture, flows, API reference
├── scripts/                # setup.sh, start.sh
├── docker-compose.yml      # Full stack orchestration
├── .github/workflows/ci.yml
└── package.json            # Root workspace manifest (Bun workspaces)
```

## 2. Tech Stack

| Layer | Technology | Key Files |
|---|---|---|
| Runtime | Bun 1.1.45 (pinned) | `package.json`, `app/api/Dockerfile`, `app/web/Dockerfile` |
| Backend framework | Elysia 1.1.25 | `app/api/src/index.ts` |
| Auth | better-auth 1.6.11 + Drizzle adapter | `app/api/src/auth/config.ts` |
| ORM / DB | Drizzle ORM 0.45.2 + postgres.js | `app/api/src/db/schema.ts`, `app/api/src/db/client.ts` |
| Frontend | React 19.0.0 + TypeScript | `app/web/src/main.tsx` |
| Router | TanStack React Router 1.121.0 | `app/web/src/router.tsx` |
| Build | Vite 6.0.7 | `app/web/vite.config.ts` |
| Styling | Hand-written CSS (design-token driven) | `app/web/src/styles.css` |
| Forms | react-hook-form + zod resolver | `app/web/src/routes/*.tsx` |
| External voice platform | Dograh (self-hosted) | `dograh/` submodule, `app/api/src/dograh/*` |

## 3. Text Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Browser                                                                     │
│  ┌──────────────────┐   ┌──────────────────┐   ┌────────────────────────┐  │
│  │ Public pages     │   │ Auth shell       │   │ Workspace / Secret   │  │
│  │ /, /login, ...   │   │ AuthProvider     │   │ Shell + route views    │  │
│  └────────┬─────────┘   └────────┬─────────┘   └───────────┬────────────┘  │
│           │                      │                         │               │
│           └──────────────────────┴─────────────────────────┘               │
│                                      │                                      │
│                              edenTreaty client                              │
│                         (credentials: include)                              │
└──────────────────────────────────────┼──────────────────────────────────────┘
                                       │ HTTP + cookies
┌──────────────────────────────────────┼──────────────────────────────────────┐
│ Vocalonix API (Elysia)               │                                      │
│  ┌───────────────────────────────────┴─────────────────────────────────────┐ │
│  │ CORS → global error handler → authRoutes / tenantRoutes / workspaceRoutes│ │
│  └───────────────────────────────────┬─────────────────────────────────────┘ │
│                                      │                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ Auth module │  │ Workspace   │  │ Tenant       │  │ Dograh client /  │ │
│  │ better-auth │  │ CRUD + team │  │ onboarding,  │  │ sync / workflow  │ │
│  └─────────────┘  │ invites     │  │ knowledge    │  └──────────────────┘ │
│                   └─────────────┘  └──────────────┘                       │
│                                      │                                       │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Outbox worker (src/worker.ts) polls `outbox_events` table             │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────┼──────────────────────────────────────┘
                                       │ SQL
┌──────────────────────────────────────┼──────────────────────────────────────┐
│ PostgreSQL (vocalonix-db)            │                                      │
│ users, sessions, accounts, businesses, memberships, invitations,           │
│ audit_logs, outbox_events, business_dograh_mappings,                        │
│ business_agent_settings, business_onboarding, business_knowledge          │
└──────────────────────────────────────┴──────────────────────────────────────┘

Dograh platform (voice orchestration) is reached by the API only, not the browser.
```

## 4. Entry Points

| Entry Point | File | What it does |
|---|---|---|
| HTTP server | `app/api/src/index.ts:218` | Creates Elysia app, registers routes, listens on `env.port` |
| Background worker | `app/api/src/worker.ts:12` | Recovers stuck events, then loops `processNextOutboxEvent()` |
| DB migrations | `app/api/src/db/migrate.ts` | Applies Drizzle migrations at startup in Docker |
| Browser app | `app/web/src/main.tsx:21` | Mounts React with QueryClient, AuthProvider, RouterProvider |
| Web build | `app/web/vite.config.ts` | Vite + React plugin; `docker-compose.yml:133` injects `VITE_API_BASE_URL` |

## 5. User-Facing Flows

### 5.1 Sign up / log in
1. Public landing (`/`) → "Start setup" → `/signup` or `/login` (`app/web/src/routes/public.tsx:75-83`).
2. Form submission calls `api.auth.signup` / `api.auth.login` (`app/api/src/auth/routes.ts:80-170`).
3. better-auth creates `users`/`accounts`/`sessions` rows; sets HTTP-only `vocalonix_session` cookie (`app/api/src/auth/config.ts:44-57`).
4. If `REQUIRE_EMAIL_VERIFICATION=false` (default dev), `emailVerified` is set true immediately (`app/api/src/auth/routes.ts:101-106`).
5. Frontend stores session in `AuthProvider` and redirects to `?redirect=` or `/app` (`app/web/src/routes/public.tsx:139`).

### 5.2 Magic link
1. `/magic` form → `POST /api/auth/magic/request` (`app/api/src/auth/routes.ts:248-279`).
2. `deliverMagicLink` inserts a hashed token into `magic_link_requests` and (if Resend configured) sends email; locally returns `previewUrl` (`app/api/src/auth/email.ts:61-87`).
3. User clicks `/magic?token=...&redirect=...` → `MagicLinkCallback` → `POST /api/auth/magic/consume` (`app/api/src/auth/routes.ts:280-367`).
4. Server verifies token hash, checks expiry/consumption, creates session.

### 5.3 Business workspace lifecycle
1. `/app/onboarding/create` form → `POST /api/businesses` (`app/api/src/workspace/routes.ts:158-267`).
2. Transaction inserts `businesses`, `memberships` (Owner), `business_dograh_mappings`, `business_agent_settings`, `business_onboarding`, `audit_logs`, and an `outbox_events` row for `dograh.workflow.ensure`.
3. Worker picks up the event and calls `synchronizeBusiness` to create/update the Dograh workflow (`app/api/src/dograh/tenant.ts:177-346`).
4. `/app/:slug/dashboard` shows workspace shell with role-aware navigation (`app/web/src/routes/business.tsx:495-543`).
5. Settings/onboarding routes (`/app/:slug/settings/*`, `/app/:slug/onboarding/:step`) drive `business_agent_settings` and queue `dograh.workflow.sync` / `dograh.widget.publish` events.

### 5.4 Team & invitations
1. `/app/:slug/team` loads members and pending invitations (`app/api/src/workspace/routes.ts:296-336`).
2. Owner/Admin invites by email → `POST /api/b/:slug/invitations` (`app/api/src/workspace/routes.ts:338-472`).
3. Token email sent; invitee visits `/invite/:token` and accepts → `POST /api/invitations/:token/accept` (`app/api/src/workspace/routes.ts:742-845`).
4. Role updates and revocations go through `PATCH /api/b/:slug/team/:userId` and `DELETE /api/b/:slug/team/:userId` (`app/api/src/workspace/routes.ts:579-704`).

### 5.5 Tenant knowledge
1. `/app/:slug/settings/knowledge` or onboarding knowledge step shows `KnowledgeManager` (`app/web/src/routes/tenant.tsx:552-889`).
2. Document/text/website reference saved to `business_knowledge` with `state=pending` (`app/api/src/tenant/routes.ts:578-741`).
3. Worker calls `uploadKnowledgeSource`, then `reconcileKnowledge` polls Dograh processing status and queues a `dograh.workflow.sync` (`app/api/src/dograh/tenant.ts:400-579`).

### 5.6 Publish / widget
1. Review step calls `POST /api/b/:slug/publish` (`app/api/src/tenant/routes.ts:454-520`).
2. `publishBusinessWidget` syncs the workflow, creates a Dograh embed token, and returns `scriptUrl` + `snippet` (`app/api/src/dograh/tenant.ts:374-398`).
3. Browser loads `/embed/dograh-widget.js` with token to start a WebRTC call.

### 5.7 Secret MVP lab
1. `/secret/test-agent`, `/secret/knowledge-base`, `/secret/agent-settings` are intentionally unprotected (`README.md:42`).
2. `App.tsx` loads Dograh widget and provides agent/knowledge/settings forms (`app/web/src/App.tsx:44-496`).
3. `App.tsx` is the only place where `window.DograhWidget` is manipulated directly.

## 6. Data Flows

| Data | Entry | Validation | Transform | Storage | Returned |
|---|---|---|---|---|---|
| Auth credentials | `public.tsx` forms | zod schemas (`loginSchema`, `signupSchema`) | lowercased email | `users`, `accounts`, `sessions` (better-auth) | session cookie + user payload |
| Business profile | `tenant.tsx` `ProfileForm` | zod (`profileSchema`) + Elysia types (`tenant/routes.ts:249-257`) | trim, uppercase country | `businesses` | settings JSON |
| Agent settings | `tenant.tsx` `AgentForm` | zod + Elysia (`tenant/routes.ts:304-314`) | trim text fields | `business_agent_settings` | Dograh workflow definition built in `dograh/config.ts` |
| Knowledge | `KnowledgeManager` | file extension, size, URL protocol | Uint8Array or text | `business_knowledge` + outbox | list with state |
| Widget | `WidgetForm` | hex color regex, domain list | normalizeDomains | `business_agent_settings` | embed token snippet |
| Invitations | `TeamPage` invite modal | email + role enum | email normalized, token hashed | `invitations` | previewUrl or success |

## 7. State Management

| State | Where | Synchronization |
|---|---|---|
| Session / auth | better-auth server + HTTP-only cookie + `AuthProvider` React state | `api.auth.session()` / `refresh()` on mount; mutations call login/logout APIs |
| Server data | React `useState` + `useEffect` per route; no global query cache | Each route fetches its own data on mount (`business.tsx:148-172`, `tenant.tsx:68-95`) |
| Form state | react-hook-form local state | Submitted via Eden client to Elysia endpoints |
| Dograh workflow sync | `business_dograh_mappings` table (desired vs synced hash, lease) | Outbox worker calls `synchronizeBusiness`; UI polls `dograh.status` indirectly via settings |
| Knowledge processing | `business_knowledge.state` + `outbox_events` | Worker reconciles via `reconcileKnowledge` and updates state |

## 8. Screens / Pages

| Route | Component | Purpose | Data Needed | Actions |
|---|---|---|---|---|
| `/` | `LandingPage` | Marketing/entry | `useAuth` status | Sign up, open app, MVP lab |
| `/login`, `/signup`, `/magic`, `/verify-email` | `public.tsx` pages | Auth flows | zod forms + API | Authenticate, verify, magic link |
| `/app` | `AppHomePage` | List workspaces | `api.businesses.list()` | Create workspace, open one |
| `/app/onboarding/create` | `CreateBusinessPage` | Create business | form + `api.businesses.create` | Submit, slug retry loop |
| `/app/:slug/dashboard` | `WorkspaceDashboardPage` | Workspace hub | `WorkspaceShell` business | Open settings, onboarding, team |
| `/app/:slug/settings/*` | `TenantSettingsPage` | Business config | `api.businesses.settings` | Save profile/agent/hours/widget/knowledge |
| `/app/:slug/onboarding/:step` | `TenantOnboardingPage` | Step-by-step onboarding | same as settings | Save + continue per step |
| `/app/:slug/team` | `TeamPage` | Members & invitations | `api.businesses.team` | Invite, revoke, resend, change role |
| `/account`, `/account/security` | `AccountPage` / `SecurityPage` | Session management | `api.auth.sessions` | Log out, log out everywhere |
| `/invite/:token` | `InvitationPage` | Accept invitation | `api.invitations.*` | Accept / decline |
| `/secret/test-agent` | `TestAgent` | WebRTC call test | `api.getWidget` | Start/end call |
| `/secret/knowledge-base` | `KnowledgeBase` | Upload documents | `api.listDocuments` etc. | Upload, delete |
| `/secret/agent-settings` | `AgentSettingsView` | Agent config | `api.getAgent` / `api.updateAgent` | Save & publish |
| `/design-system` | `DesignSystemPage` | Component playground | static | Test dropdown/modal |

## 9. Modules & Responsibilities

| Module | File(s) | Responsibility |
|---|---|---|
| `env` | `app/api/src/env.ts` | Zod-validated environment; production hardening checks |
| `db` | `app/api/src/db/schema.ts`, `client.ts`, `migrate.ts` | Drizzle schema, connection pool, migrations |
| `auth` | `app/api/src/auth/config.ts`, `routes.ts`, `email.ts` | better-auth setup, signup/login/magic/verify endpoints, email capture |
| `workspace` | `app/api/src/workspace/routes.ts`, `context.ts`, `permissions.ts` | Business CRUD, team, invitations, role checks |
| `tenant` | `app/api/src/tenant/routes.ts` | Onboarding, profile/agent/hours/widget/knowledge/publish endpoints |
| `dograh` | `app/api/src/dograh/client.ts`, `tenant.ts`, `workflow.ts`, `config.ts`, `errors.ts` | HTTP client to Dograh, desired-state builder, sync engine, failure classification |
| `outbox` | `app/api/src/outbox.ts`, `worker.ts` | Persistent async job queue, retry/backoff, processing loop |
| `web api client` | `app/web/src/api.ts` | Eden Treaty client, error unwrapping, typed wrappers |
| `auth context` | `app/web/src/auth/AuthProvider.tsx` | Session state, login/logout/refresh |
| `routes` | `app/web/src/routes/*.tsx`, `router.tsx` | Page components and route definitions |
| `ui` | `app/web/src/components/ui/*.tsx` | Reusable design-system components |
| `shell` | `app/web/src/components/shell/*.tsx` | Layout shells (auth, page, workspace, onboarding) |

## 10. Build / Test Infrastructure

- `bun run typecheck` runs `tsc --noEmit` in both workspaces (root `package.json:11`).
- `bun run test` runs `bun test` in `app/api` only (root `package.json:13`).
- `bun run build` builds `app/web` with Vite and typechecks `app/api` (root `package.json:12`).
- CI: `.github/workflows/ci.yml` does checkout, submodule init, Bun 1.1.45 setup, install, setup, migrate, typecheck, test, build.
- Docker: `app/api/Dockerfile` runs migrations inside the container `CMD`; `app/web/Dockerfile` copies `dograh/ui/public/embed/dograh-widget.js` into the build context.
