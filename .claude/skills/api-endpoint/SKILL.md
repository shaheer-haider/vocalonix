---
name: api-endpoint
description: Add or change a Harkbell API endpoint. Use whenever work touches app/api/src/**/routes.ts — a new route, a changed request or response shape, a permission change, or a new error code. Covers the Elysia + Drizzle + tenancy pattern, the permission matrix, error handling, the Eden type contract with the web app, and how to verify a route when no HTTP tests exist.
---

# Adding or changing an API endpoint

## Decide where it goes

| The route is about | File | Prefix |
|---|---|---|
| One business's data or configuration | `app/api/src/tenant/routes.ts` | `/api/b/:slug/…` |
| Businesses, team, invitations | `app/api/src/workspace/routes.ts` | |
| Plans, Checkout, the Stripe webhook | `app/api/src/billing/routes.ts` | |
| Operator readiness, voices, providers | `app/api/src/platform/routes.ts` | `/api/platform/…` |
| Something the **engine** calls mid-call | `app/api/src/agent/routes.ts` | `/api/agent-tools/:businessId/…` |
| Sign-in, sessions | `app/api/src/auth/routes.ts` | `/api/auth/…` |
| The public demo funnel | `app/api/src/demo/routes.ts` | |

`index.ts` composes plugins and nothing else. A route defined there rather
than in a plugin module is how the pre-multi-tenancy handlers survived as long
as they did: session-guarded, never tenant-scoped, and invisible in every
review because nobody looked in the composition root for routes.

A new plugin file must be registered with `.use(...)` in
`app/api/src/index.ts`.

## The shape

```ts
.post(
  "/api/b/:slug/things",
  async ({ params, body, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    requirePermission(workspace.role, "things.manage");

    // ... Drizzle, scoped to workspace.business.id, never to a client-supplied id

    await enqueueOutbox({
      businessId: workspace.business.id,
      eventType: "dograh.workflow.sync",
      payload: { businessId: workspace.business.id },
      dedupeKey: `dograh.workflow.sync:${workspace.business.id}`,
    });

    return { thing };
  },
  { body: t.Object({ name: t.String({ minLength: 1, maxLength: 120 }) }) },
)
```

### Non-negotiable

1. **`requireWorkspace` then `requirePermission`.** Every workspace route.
   `requireWorkspace` returns the business; scope every query to
   `workspace.business.id`. A `businessId` taken from the body or a query
   parameter is a cross-tenant leak — there is no database-level isolation.
   Non-members get 404, not 403; do not "improve" that.

2. **Validate the body with Elysia's `t`,** in the second argument. Not zod, not
   a manual check — this is what gives the web app its types through Eden. zod
   is for the environment and domain parsing only.

3. **Errors are `ApiError(status, "CODE", "A full sentence.")`.** The message is
   shown to a user unedited. Never pass a provider's raw error through.

4. **Engine work goes through `enqueueOutbox`,** never a direct Dograh call
   from a handler. Give it a `dedupeKey` unless you want one event per request.

5. **List endpoints use `parseListQuery`** from `app/api/src/pagination.ts`.

## Adding a permission

`app/api/src/workspace/permissions.ts` — add to the `Permission` union and the
`matrix`. Then mirror it in `app/web/src/permissions.ts` if the UI should hide
the control. The client copy is a hint; the server is the authority.

Current matrix: `workspace.view` (all roles) · `callbacks.manage`,
`contacts.manage`, `bookings.manage` (Staff and up) · `agent.edit`,
`knowledge.manage`, `bookings.configure` (Manager and up) · `team.manage`
(Admin and up) · `billing.access`, `business.delete` (Owner only).

## Wire up the frontend

`app/web/src/api.ts` — add the request/response interfaces and the call. Never
`fetch` from a component; wrap in `useQuery`/`useMutation` and invalidate the
affected keys.

The web typecheck imports `typeof app` from the API source, so a changed
response shape breaks `bun run typecheck` on the **web** side. That is the
contract working, not a problem to route around.

## Tests

Extract any real logic — a decision, a calculation, a parse — into a pure
function and test that. `synchronizationDecision`, `computeOpenSlots` and
`failureUpdate` all exist in that shape for this reason.

There are currently **no HTTP route tests in this repository**. If you write
one, start at the boundary rather than the happy path:

```ts
const response = await app.handle(new Request("http://localhost/api/b/acme/things"));
expect(response.status).toBe(401);
```

A non-member getting 404, a Viewer getting 403 on a mutation, and an
unauthenticated request getting 401 are the three assertions worth the most.

## Verify

`bun run typecheck && bun run test`, then exercise it for real — a green suite
proves nothing about a route here:

```bash
docker compose up -d --build --wait harkbell-api vocalonix-worker
curl -i -X POST http://localhost:3001/api/b/<slug>/things \
  -H 'content-type: application/json' -b 'vocalonix_session=<token>' -d '{"name":"x"}'
```

Check all four paths: unauthenticated → 401, non-member → 404, insufficient role
→ 403, valid → 200. State what you ran in the PR.

## Finish

- [ ] `requireWorkspace` + `requirePermission`
- [ ] Body validated with `t`
- [ ] Errors are `ApiError` with a human sentence and a stable code
- [ ] Engine side effects enqueued, handler idempotent
- [ ] Types and calls added to `app/web/src/api.ts`
- [ ] Route added to the table in `docs/05-api-reference.md`
- [ ] Auth boundaries exercised, not just the happy path
