---
name: release
description: Ship Harkbell to production, or diagnose a live problem. Use when asked to deploy, cut a release, prepare for launch, check production health, or investigate an incident on the Hetzner servers. Covers the pre-flight checklist, what the deploy pipeline does, verifying against the served artifact, the runbook, and why there is no automated rollback.
---

# Releasing and operating

`main` is production. A push to it deploys. Treat every merge accordingly.

## Pre-flight

```bash
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run build
```

Then:

- [ ] Every schema change has its generated SQL **and** snapshot committed —
      the API container runs `db:migrate` on start, so a missing file is a green
      build and a broken deploy
- [ ] No migration in this release is destructive without an explicit call-out
      and a **tested** restore
- [ ] `TENANT_CONFIG_VERSION` bumped if any generated workflow shape changed
- [ ] The walkthrough in the `verify-change` skill has been run against the
      Compose stack
- [ ] `STATUS.md` reflects what is now true
- [ ] No secret, `.env`, tfstate or SSH key is in the diff

## What the pipeline does

`.github/workflows/deploy.yml`, on push to `main` or manual dispatch:

1. checks out with submodules,
2. rsyncs to the Harkbell server with the mandatory excludes,
3. `docker compose -p vocalonix --env-file .env up -d --build --wait`,
4. polls `/api/health` over TLS for up to five minutes, then `/api/dograh/health`,
   and prints the served bundle name.

The project name is **pinned** to `vocalonix`. Never derive it from whatever owns
a container called `caddy` on the host — adopting a foreign project name
recreates that other stack's shared containers with this stack's config. Pinned,
a wrong-host deploy fails loudly and changes nothing.

The pipeline never touches either server's `.env`, and never touches the Dograh
server. Both are manual, deliberately.

Compose recreates only services whose image changed, so a frontend-only release
replaces `vocalonix-web` and leaves the API, worker, database and Caddy running.

## Verify the artifact, not the container

A stale image reports healthy. Assert on what is actually served:

```bash
curl -fsS https://<host>/api/health
curl -fsS https://<host>/api/dograh/health     # expect turnEnabled: true
C=$(curl -sS https://<host>/ | grep -o 'assets/index-[^"]*\.css')
curl -sS "https://<host>/$C" | grep -c '<a marker from this release>'
```

Then sign in and check one real workspace: the dashboard loads, a published
business still shows `synced`, and `outbox_events` has no new failures.

## Production environment

`env.ts` refuses to boot without: a non-default `AUTH_SECRET`, `RESEND_API_KEY`,
`REQUIRE_EMAIL_VERIFICATION=true`, HTTPS on `API_PUBLIC_URL` and every
`APP_ORIGIN`, and either `DOGRAH_API_KEY` or a non-placeholder service password.
A box that will not start is telling you something true — read the field errors
rather than relaxing the rule.

Also required in practice:

- `STRIPE_WEBHOOK_SECRET` — without it the webhook refuses **every** delivery
  and subscriptions never activate. That is deliberate: an unverified webhook
  grants paid plans to anyone who can POST to a public URL.
- `TELNYX_WEBHOOK_PUBLIC_KEY` if phone numbers are on.
- **Exactly one API instance.** Rate limiting is in-memory; two instances each
  enforce their own share and the effective limit silently doubles.

## Runbook

| Symptom | First move |
|---|---|
| UI stuck on "changes pending" | The worker is the only thing that talks to the engine. Check it is running and the heartbeat is fresh. A restart is safe — stuck events self-recover after 5 minutes |
| One tenant's agent is wrong | `GET /api/b/:slug/dograh`. A `rejected` state will not retry until the config changes or `POST /api/b/:slug/dograh/retry` |
| A bought number does not ring | Purchase, connection binding and engine routing are three steps. `reconcileTelephonyConfiguration()` re-asserts all three at boot, so restart the API first |
| Agent is deaf or truncates mid-sentence | Voice stack. Check `VOICE_STACK` and `/api/platform/status`. Realtime speech-to-speech only surfaces the caller's words when the model chooses to |
| Subscriptions do not activate | `STRIPE_WEBHOOK_SECRET`, then Stripe's delivery log for signature failures |

Useful queries:

```sql
select status, count(*), max(attempt_count) from outbox_events
where status in ('pending','failed') group by status;

select business_id, sync_state, error_category, last_error
from business_dograh_mappings where sync_state not in ('synced','offboarded');
```

## Rollback

There is none, automated. Revert the commit on `main` and let the pipeline run.

**A migration does not roll back with it.** Drizzle generates forward-only SQL.
If the release contained a destructive migration, restoring the database is the
only path — which is why the restore must have been tested before launch rather
than during an incident.

## Secrets

`terraform/.ssh/id_ed25519` grants **root on both servers** and lives only on the
operator's machine. Never commit it, never rsync it, never paste it. Same for
`terraform/*.tfstate`, the root `.env`, `.secrets`, and `deploy/hetzner/*/.env`.

Every rsync carries:

```
--exclude 'terraform/.ssh' --exclude 'terraform/*.tfstate*' --exclude '.env' --exclude 'deploy/hetzner/*/.env'
```

**Never rotate the deployment key with `tofu apply`.** `hcloud_server.ssh_keys`
is `ForceNew` — editing it plans a **server replacement** and destroys both
machines and their data. Append the new public key over the old connection,
verify, promote, remove the old one, and only then review the project-key plan.
Full procedure in `deploy/hetzner/README.md`.

## Ask before you act

Deploying, restarting a production service, running anything against the
production database, and rotating a key are all outward-facing and hard to
reverse. Confirm with the operator first unless they have already said to
proceed.
