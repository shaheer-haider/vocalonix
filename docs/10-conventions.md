# Conventions

House style, derived from the code that already exists. When in doubt, read the
nearest neighbour and match it.

## Naming

| Layer | Style | Example |
|---|---|---|
| TypeScript identifiers | `camelCase` | `syncedConfigHash` |
| Types, interfaces, components | `PascalCase` | `TenantWorkflowInput` |
| Database columns and tables | `snake_case` | `synced_config_hash` |
| Constants | `SCREAMING_SNAKE` | `TENANT_CONFIG_VERSION` |
| Error codes | `SCREAMING_SNAKE` | `WORKSPACE_NOT_FOUND` |
| Outbox event types | dotted, lowercase | `dograh.knowledge.upload` |
| Workflow node ids | `vocalonix-` prefixed | `vocalonix-answer` |
| CSS classes | `kebab-case`, BEM-ish modifiers | `.ui-box--tinted` |
| Files | `camelCase.ts`, `PascalCase.tsx` for components | `voiceStack.ts`, `Modal.tsx` |

Drizzle bridges TypeScript and SQL explicitly in `schema.ts`
(`syncedConfigHash: text("synced_config_hash")`). Never rely on an implicit
transform.

**Harkbell is what a customer reads; vocalonix is what infrastructure is called.**
The full rule is in [`../CLAUDE.md`](../CLAUDE.md#naming--read-this-before-you-fix-anything).

## Comments

This codebase's comments are unusually good, and they are good in one specific
way: **they record the failure that motivated the code.**

```ts
// One live claim per number across the whole platform; released rows stay
// for history and must not block a later re-claim.
```

```ts
// A successful processing poll (e.g. remote document still processing) is not a
// failure: reset the attempt budget so slow-but-healthy work never exhausts the
// retry allowance reserved for genuine failures.
```

Both explain something you cannot recover by reading the line beneath them, and
both stop a future reader from "simplifying" the code back into a bug.

Write comments like that. Do not write comments that restate the code, and do
not leave the scaffolding of your own reasoning behind (`// loop over items`,
`// now we check`). A file-top block comment explaining what a module is for and
why it is shaped that way is welcome — `voiceStack.ts` and `plans.ts` are the
models.

## Errors

Server:

```ts
throw new ApiError(402, "PLAN_LIMIT_SEATS",
  `The ${plan.name} plan includes ${plan.seats} team members. Upgrade to invite more.`);
```

- `message` is a **complete sentence**, written for the person who will read it
  on screen. It says what happened and what to do.
- `code` is stable and machine-readable. Adding one is fine; changing one is a
  breaking change for the client.
- Never surface a provider's raw error text. `stripeRequest` collapses every
  Stripe failure into one `BILLING_PROVIDER_ERROR`; Dograh failures go through
  `classifyDograhFailure` first.

Client: catch `ApiClientError`, render `.message`, branch on `.code`.

## Validation

Two libraries, two jobs, and they do not overlap:

- **Elysia `t`** for request bodies, in the route's second argument. This is
  what gives the web app its end-to-end types through Eden, so it is not
  optional and cannot be replaced with a manual check.
- **zod** for everything else: the environment (`env.ts`), configuration
  parsing, domain shapes, and frontend forms via `@hookform/resolvers`.

## Async work

Anything that must reach the Dograh engine goes through `enqueueOutbox`, never a
direct call from a request handler. Give every event a `dedupeKey` unless you
genuinely want N events for N calls.

Handlers must be **idempotent**. They will be retried, and a backfill may run
over the same data.

## Database

- Generate migrations, never hand-write them. If Drizzle generates something you
  dislike, change the schema until it does not.
- Reach for a **partial unique index** to express "one live X" before reaching
  for an application-level check. Several already exist because an application
  check lost a race.
- Soft delete where history matters; `ON DELETE SET NULL` for references to an
  actor; `ON DELETE CASCADE` from a business to its own rows.
- Timestamps are always `withTimezone: true`.
- JSONB only for genuinely open-ended shapes. Anything you filter, sort or sum
  on gets a column.

## Time

Every business has a `timezone`. Date and time logic goes through
`app/api/src/agent/slots.ts` — `zonedTimeToUtc`, `todayInTimeZone`,
`weekdayInTimeZone`. Ad-hoc `new Date()` arithmetic in a handler is a bug that
shows up as an appointment an hour out for one customer in one country.

## Frontend

- Navigation is TanStack Router `<Link>` / `navigate()`. Never `<a href>` or
  `window.location` for an internal route.
- Data goes through `api.ts` and TanStack Query. Never `fetch` in a component.
- Use the primitives in `components/ui` before writing a new styled `<div>`.
- Use the design tokens in `styles.css`. No off-scale colours, no hardcoded
  spacing.
- Keep authenticated routes lazy in `router.tsx`.
- Add a `ROUTE_TITLES` entry for every new route.

## Imports

Node builtins first (`node:crypto`), then external packages, then relative
imports — with a blank line between the groups. Alphabetical within a group.
Match the file you are editing.

## Tests

Colocated `*.test.ts`, `bun:test`. Prefer extracting a pure function and testing
that over mocking a module. Inject collaborators (`client?: DograhManagementClient`)
where a boundary is unavoidable.

## Commits and PRs

Subject lines are **imperative present**, describing the behaviour change from
the user's or system's point of view — not the mechanics:

- ✅ `Keep a released number instead of handing it back`
- ✅ `Point agent tools at a URL the engine can actually resolve`
- ✅ `Give a caller who says nothing a contact record`
- ❌ `Update telephony.ts`
- ❌ `fix bug`

One concern per PR. A rename, a refactor and a behaviour change in one diff is
three PRs.

---

## Glossary

| Term | Meaning |
|---|---|
| **Business** | The tenant. Addressed by `slug` |
| **Workspace** | The UI for one business, `/app/:slug/*` |
| **Membership** | A user's role in a business |
| **Role** | Owner, Admin, Manager, Staff, Viewer |
| **Permission** | An entry in the matrix in `workspace/permissions.ts` |
| **Agent** | A business's configured persona |
| **Workflow** | The graph on the Dograh engine that a call runs |
| **Run** | One call on the engine, identified by `runId` |
| **Publish** | Turn the draft configuration into the live agent |
| **Sync** | Reconcile desired configuration with the engine |
| **Config hash** | Stable hash of the desired workflow; decides whether a sync does anything |
| **Outbox** | `outbox_events` — the durable queue for engine work |
| **Lease** | A 5-minute claim stopping two workers syncing one business |
| **Vertical** | A trade: intake questions, defaults, agent safety rules |
| **Knowledge** | Documents and text the agent answers from |
| **Knowledge gap** | A question the agent could not answer |
| **Callback** | A promise to ring someone back |
| **Embed token** | Short-lived, server-minted credential the widget uses |
| **Voice stack** | `pipeline` (STT→LLM→TTS) or `realtime` (speech-to-speech) |
| **Agent tool** | An HTTP endpoint the engine calls mid-conversation |
| **Readiness panel** | `GET /api/platform/status` — what is configured and what is missing |
| **Dograh** | The vendored voice engine. Never modified here |
| **Telnyx** | The carrier behind phone numbers |
