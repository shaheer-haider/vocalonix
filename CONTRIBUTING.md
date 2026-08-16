# Engineering standard

The rules for changing this repository. They apply to everyone — human or agent
— and they apply to small changes too, because every incident this project has
had came from a change that looked small.

`main` is production. A push to it deploys.

---

## 1. Before you write anything

Read [`CLAUDE.md`](CLAUDE.md). Then answer three questions:

1. **Is this the whole job?** Deliver the scope that was asked for. Do not
   quietly narrow it, do not widen it into a refactor, and do not leave the
   unglamorous half undone.
2. **What can this break?** Multi-tenancy, the config hash, the outbox, the
   telephony three-step, and billing entitlements are the load-bearing parts.
   If your change touches one, say so in the PR.
3. **Is there an existing pattern?** There almost always is. Match the nearest
   neighbour rather than introducing a second way to do the same thing.

## 2. One concern per pull request

A rename, a refactor and a behaviour change in one diff is three pull requests.
Reviewers cannot separate the risky third from the harmless first two, so they
approve all of it or none of it.

Branch from `main`, name it `type/short-description` (`fix/`, `feat/`, `chore/`,
`docs/`). Commit subject lines are imperative present and describe the change in
terms of behaviour:

- ✅ `Keep a released number instead of handing it back`
- ✅ `Point agent tools at a URL the engine can actually resolve`
- ❌ `Update telephony.ts` · ❌ `fix bug` · ❌ `address review comments`

## 3. Definition of done

Every box, every time.

- [ ] `bun run typecheck` clean
- [ ] `bun run test` green
- [ ] **New or extended tests** for any logic added — branching, maths, parsing,
      state transitions. "It's simple" is how the untested path gets shipped
- [ ] Schema change → `bun run db:generate`, generated SQL **and** snapshot
      committed, `bun run db:migrate` clean against an empty database
- [ ] Workflow shape change → `TENANT_CONFIG_VERSION` bumped
- [ ] New workspace route → `requireWorkspace` **and** `requirePermission`
- [ ] New permission → added to `workspace/permissions.ts`, and to
      `app/web/src/permissions.ts` if the UI should respect it
- [ ] New environment variable → `env.ts` (with a production rule if it is
      required there), `.env.example`, and `scripts/setup.sh` if it is a
      generated secret
- [ ] User-visible strings say **Harkbell**
- [ ] Documentation updated in the same commit: `docs/` when behaviour changed,
      `STATUS.md` when what-is-built changed, `CLAUDE.md` when a rule changed
- [ ] **The change was actually run.** See §5

## 4. Rules that are not negotiable

**Tenancy.** Every workspace route begins with
`requireWorkspace(request.headers, params.slug)` and then `requirePermission`.
A handler that gets a `businessId` from anywhere else is a cross-tenant leak.
There is no database-level safety net.

**Secrets never reach the browser.** Only `VITE_`-prefixed variables are
exposed, and no provider key, service password or engine credential may be one.
The browser gets a server-minted embed token and nothing else.

**Engine work goes through the outbox.** Never call Dograh from a request
handler. Handlers must be idempotent; they will be retried.

**The config hash is the contract.** Change the shape of a generated workflow
and bump `TENANT_CONFIG_VERSION`, or existing tenants silently keep the old
graph.

**Do not modify `dograh/`.** It is a pinned submodule. An upgrade is its own
change with its own testing.

**Do not rename infrastructure identifiers.** `vocalonix` in a repo name, a
container, a database, an env var, a widget global or a workflow node id stays.
Only customer-visible text says Harkbell.

**Do not weaken a boundary to make something work.** If a check is in the way,
the design is wrong, not the check. Say so instead of removing it.

## 5. Evidence, not assertion

`bun run test` passing is not evidence that a route works — no test in this
repository exercises an HTTP route. See
[`docs/09-testing.md`](docs/09-testing.md).

So, in the PR description, state **what you actually ran**:

> Compose stack rebuilt from this branch (bundle `index-B7xK2p.js`). Bought a
> number in the Telnyx sandbox, confirmed the routing record on the engine,
> released it and re-claimed it. `bun run test` green, typecheck clean.

Not:

> Tests pass.

If you could not verify something — no provider key, no sandbox — **say which
part is unverified**. An honest gap is manageable; a silent one is how the
telephony break shipped.

Anything touching a route, the worker, or the engine is verified on the Docker
Compose stack. Confirm the served bundle actually contains your change first:
containers report healthy while serving a stale image
([how](docs/09-testing.md#check-you-are-testing-your-own-code)).

## 6. Review

A reviewer is checking four things, in this order:

1. **Correctness at the boundaries** — auth, tenancy, permissions, money,
   idempotency, race conditions. Not the happy path.
2. **Blast radius** — what else does this touch? Is a migration reversible? Does
   it need `TENANT_CONFIG_VERSION`?
3. **Evidence** — does the description say what was run, and does that match the
   risk?
4. **Fit** — does it look like the code around it, or has it invented a second
   way to do something?

Style, naming and formatting come last and are never a blocker on their own.

Approve with reservations by saying what they are. Do not approve a change whose
verification you do not believe.

## 7. Migrations

Forward-only. Drizzle does not generate a down migration, and there is no
automated rollback — reverting a commit does not revert its migration.

Therefore:

- **Additive by default.** New nullable column, backfill, then tighten in a
  later release.
- A destructive migration (drop, narrow, non-null without a default) needs an
  explicit call-out in the PR and a tested restore path.
- Never edit a migration that has been applied to production. Write a new one.
- Test against an **empty** database (`docker compose down -v`), not just your
  own, which already has the columns.

## 8. Dependencies

Versions are pinned exactly — no `^`, no `~`. Bun is pinned in `engines`, in CI
and in both Dockerfiles.

Adding a dependency needs a reason in the PR. This codebase deliberately calls
Stripe over raw REST rather than pulling in an SDK, and uses no CSS framework.
Before adding one, check whether ~30 lines of `fetch` would do.

Never commit a lockfile change you did not intend.

## 9. Security

- Throw `ApiError` with a message safe to display. Never surface a provider's
  raw error.
- Anything user-supplied that becomes a file is checked by extension **and**
  content signature (`uploads.ts`).
- Redirect targets go through `safeReturnTo()`.
- Tokens (magic links, invitations) are stored **hashed**, with an expiry and a
  consumed marker.
- Webhooks are signature-verified with `timingSafeEqual`, and refuse everything
  when the signing secret is unset.
- Public endpoints are rate limited. Note that the limiter is in-memory and
  correct for one API instance only.
- Never log a secret, a token, or a full transcript.

If you find a vulnerability, do not open a public PR describing it. Tell the
maintainer, fix it, and describe it in neutral terms afterwards.

## 10. Documentation

Documentation is part of the change, not a follow-up.

| Changed | Update |
|---|---|
| How something works | the relevant `docs/` file |
| What is built or still missing | `STATUS.md` |
| A rule an agent must follow | `CLAUDE.md` |
| Setup, environment, deploy | `docs/02-setup.md`, `docs/08-operations.md` |
| A recurring workflow | the matching skill in `.claude/skills/` |

Stale documentation is worse than none: it is confidently wrong. If you find
some, fix it in the change you are already making.

`docs/archive/` is history. Do not update it; write something new instead.

## 11. Going live

Before a release: work through the launch checklist in
[`docs/08-operations.md`](docs/08-operations.md#launch-checklist) and the full
walkthrough in [`docs/09-testing.md`](docs/09-testing.md#the-full-walkthrough).

After: verify against the **artifact** — the served bundle and the live health
endpoints — not against a container reporting healthy.
