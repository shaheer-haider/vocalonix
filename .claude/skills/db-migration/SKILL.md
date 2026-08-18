---
name: db-migration
description: Change the Harkbell database schema safely. Use whenever work touches app/api/src/db/schema.ts or app/api/drizzle/ — adding a table or column, changing a type, adding an index or constraint. Covers Drizzle generation, the forward-only migration rule, the partial-unique-index pattern this codebase relies on, and how to test against an empty database.
---

# Changing the database schema

Migrations here are **forward-only**. Drizzle generates no down migration, and
reverting a commit does not revert its migration. The API container runs
`db:migrate` on start, so a schema change whose SQL file is not committed is a
green build and a broken deploy.

## The loop

```bash
# 1. edit app/api/src/db/schema.ts
bun run db:generate     # writes app/api/drizzle/NNNN_*.sql + meta/NNNN_snapshot.json
bun run db:migrate      # applies to your local database
bun run typecheck
```

Commit the schema edit, the generated SQL **and** the snapshot together.

Never hand-write a migration to work around a generation you dislike. Change the
schema until Drizzle produces what you want. Never edit a migration that has
already run in production — write a new one.

## Additive by default

| Want | Do |
|---|---|
| A new required column | Add it nullable, deploy, backfill, tighten in a later release |
| To drop a column | Stop writing it, deploy, drop it later |
| To rename | Add the new one, dual-write, migrate readers, drop the old one |
| A destructive change | Call it out explicitly in the PR, and have a tested restore |

A destructive migration on a live database with no tested restore is the one
change that can lose customer data permanently.

## House patterns

**Ids** are `text` primary keys holding `randomUUID()` from application code.
Not serial, not `gen_random_uuid()`.

**Timestamps** are always `timestamp(..., { withTimezone: true })`. Business-local
time is derived at read time from the business's `timezone` column.

**Column naming** is explicit on both sides:
`syncedConfigHash: text("synced_config_hash")`. camelCase in TypeScript,
snake_case in Postgres, never an implicit transform.

**Tenant-owned tables** carry
`businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" })`
and an index on it.

**References to an actor or subject** use `onDelete: "set null"` — deleting a
user must not delete the record of what they did.

**Soft delete** (`deletedAt`) where history matters. Every reader must then
filter on it; `requireWorkspace` already does for businesses.

### Partial unique indexes

The pattern this codebase leans on hardest. Use one to express "one live X"
instead of checking in application code — several exist precisely because an
application check lost a race:

```ts
uniqueIndex("business_phone_numbers_one_live_per_business")
  .on(table.businessId)
  .where(sql`${table.status} <> 'released'`),
```

Existing examples worth copying: one live phone claim per number and per
business; one pending invitation per email per business; one active outbox event
per dedupe key; one call record per `(business_id, run_id)`.

**JSONB** only for genuinely open-ended shapes (`attempts`, `business_hours`,
`payload`). Anything you will filter, sort or sum on gets a real column — the
`call_records` table exists because aggregating over a remote service's pages
does not work.

## Enums

`pgEnum` values are additive-only in practice. Adding a value is cheap; removing
one requires a type rewrite. Name them singular and lowercase
(`membership_status`, `dograh_sync_state`).

## Test it properly

Against an **empty** database, not yours — yours already has the columns:

```bash
docker compose down -v
docker compose up -d --build --wait
docker compose logs harkbell-api | head -40   # migrations run on start
```

CI does this too: `.github/workflows/ci.yml` runs `db:migrate` against a fresh
Postgres 16 service on every PR.

## Finish

- [ ] Schema edit, generated SQL and snapshot committed together
- [ ] Migration is additive, or the destructive part is called out in the PR
- [ ] `businessId` + cascade + index on any tenant-owned table
- [ ] Uniqueness expressed as a (partial) index, not an application check
- [ ] Applied cleanly to an empty database
- [ ] `docs/04-data-model.md` updated with the table or column and why it exists
