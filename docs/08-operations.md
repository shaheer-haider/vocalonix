# Operations

Full deploy and key-rotation commands live in
[`../deploy/hetzner/README.md`](../deploy/hetzner/README.md). This document is
the operator's mental model, the release rules, and the runbook.

## Production shape

Two Hetzner servers in Helsinki, provisioned by OpenTofu (`terraform/`), each
behind Caddy with automatic Let's Encrypt certificates.

| Server | Size | Runs |
|---|---|---|
| **Harkbell** | cx23, 2 vCPU / 4 GB | Postgres, API, worker, web, Caddy |
| **Dograh** | cx33, 4 vCPU / 8 GB | Postgres, Redis, MinIO, Dograh API + UI, coturn (TURN), Caddy |

Each server keeps its **own** `.env`. Never sync yours over it.

## Deploying

Pushes to `main` trigger `.github/workflows/deploy.yml`, which:

1. checks out with submodules,
2. rsyncs the repo to the Harkbell server with the mandatory excludes,
3. runs `docker compose -p vocalonix --env-file .env up -d --build --wait`,
4. polls `/api/health` over TLS for up to five minutes, then checks
   `/api/dograh/health` and prints the served bundle name.

The Compose **project name is pinned** to `vocalonix`. It must never be derived
from whatever happens to own a container called `caddy` on the host: adopting a
foreign project name recreates that other stack's shared containers with this
stack's config. Pinned, a wrong-host deploy fails loudly on a container-name
conflict and changes nothing.

The pipeline never touches either server's `.env` and never touches the Dograh
server. Both are manual, on purpose.

`docker compose up -d --build` recreates only the services whose image actually
changed, so a frontend-only change replaces `vocalonix-web` and leaves the API,
worker, database and Caddy running — no API downtime.

### The API runs migrations on start

`app/api/Dockerfile` is `bun run db:migrate && bun run start`. A schema change
without its generated SQL file committed is a green build and a broken deploy.

### Verify against the artifact, not the container

A stale image still reports healthy. Assert on what is actually being served:

```bash
curl -fsS https://<host>/api/health
curl -fsS https://<host>/api/dograh/health    # expect turnEnabled: true
C=$(curl -sS https://<host>/ | grep -o 'assets/index-[^"]*\.css')
curl -sS "https://<host>/$C" | grep -c '<a marker from your change>'
```

## Going to production

```env
NODE_ENV=production
REQUIRE_EMAIL_VERIFICATION=true
AUTH_SECRET=<unique, ≥32 chars, not the dev default>
RESEND_API_KEY=re_...
EMAIL_FROM=Harkbell <hello@harkbell.com>
APP_ORIGIN=https://harkbell.com
API_PUBLIC_URL=https://harkbell.com
VOCALONIX_API_PUBLIC_URL=https://harkbell.com
```

`env.ts` enforces most of this at boot and **refuses to start** otherwise:
HTTPS on `API_PUBLIC_URL` and every `APP_ORIGIN`, a non-default `AUTH_SECRET`,
`RESEND_API_KEY` present, email verification on, and either `DOGRAH_API_KEY` or
a non-placeholder service password. A production box that will not boot is
telling you something true.

## Launch checklist

- [ ] Speech keys set; `/api/platform/status` reports `callsReady: true`
- [ ] `TELNYX_API_KEY` and `TELNYX_WEBHOOK_PUBLIC_KEY` if phone numbers are on
- [ ] Resend key **and a verified sending domain**
- [ ] `STRIPE_WEBHOOK_SECRET` set — without it the webhook refuses every
      delivery, and subscriptions never activate
- [ ] Stripe webhook endpoint registered at `https://<host>/api/billing/webhook`
      for `customer.subscription.created/updated/deleted`
- [ ] Unique production `AUTH_SECRET`
- [ ] HTTPS `API_PUBLIC_URL` / `APP_ORIGIN`
- [ ] Database backups **and a restore that has actually been tested**
- [ ] Uptime monitoring on `/api/health` and on the worker heartbeat
- [ ] **Exactly one API instance** — rate limiting is in-memory (see below)

## Scaling constraint

`app/api/src/rateLimit.ts` keeps counters in process memory. With two API
instances behind a load balancer, each enforces its own share and the effective
limit silently doubles. Run one instance, or move the limiter to a shared store
first. This is the one thing that must be fixed before scaling out.

The worker is also written as a single sequential loop. Outbox claiming is
race-safe, so a second worker would not corrupt anything, but nothing has been
tested that way.

## Monitoring

| Signal | Where |
|---|---|
| API liveness | `GET /api/health` |
| Engine reachability + TURN | `GET /api/dograh/health` |
| Whole-platform readiness | `GET /api/platform/status` (authenticated) |
| Worker liveness | heartbeat file, `WORKER_HEARTBEAT_PATH`, written every 10s |
| Sync backlog | `outbox_events` where `status IN ('pending','failed')` |
| Per-tenant sync health | `business_dograh_mappings.sync_state`, `last_error` |

Two queries worth having on a dashboard:

```sql
-- work that is stuck or given up
select status, count(*), max(attempt_count)
from outbox_events
where status in ('pending','failed')
group by status;

-- tenants whose agent does not match their configuration
select business_id, sync_state, error_category, last_error
from business_dograh_mappings
where sync_state not in ('synced','offboarded');
```

## Runbook

### Nothing publishes; the UI sits on "changes pending"

The worker is the only thing that talks to the engine. Check it is running,
check the heartbeat is fresh, then look at `outbox_events` for the business.
A worker restart is safe — `recoverStuckOutboxEvents()` returns anything left
`processing` for over five minutes to `pending`.

### One tenant's agent is wrong

`GET /api/b/:slug/dograh` gives sync state and the last error. A `rejected`
state means the engine refused that configuration and will not be retried until
the configuration changes or someone calls `POST /api/b/:slug/dograh/retry`.

### A bought number does not ring

Purchase, connection binding and engine routing are three separate steps.
`reconcileTelephonyConfiguration()` re-asserts all three at API boot, so
restarting the API is the first thing to try. If it persists, compare the number
in Telnyx, in `business_phone_numbers`, and in the engine's routing records.

### Calls connect but the agent is deaf or truncates

Almost always the voice stack. Check `VOICE_STACK` and
`GET /api/platform/status`. Realtime speech-to-speech only surfaces the caller's
words when the model chooses to; the pipeline stack puts transcription on its own
stream. See [`../STATUS.md`](../STATUS.md) for the current production setting.

### Subscriptions do not activate after payment

`STRIPE_WEBHOOK_SECRET` unset means every delivery is refused — deliberately,
because an unverified webhook grants paid plans to anyone who can POST. Check
the secret, then Stripe's delivery log for signature failures.

### Rolling back

There is no automated rollback. Revert the commit on `main` and let the deploy
workflow run. **A migration does not roll back with it** — Drizzle generates
forward-only SQL. If a release contained a destructive migration, restoring the
database is the only path, which is why the restore has to have been tested
before launch and not during it.

## Secrets

| Path | What |
|---|---|
| `terraform/.ssh/id_ed25519` | Deployment key. **Root on both servers.** Operator's machine only |
| `terraform/*.tfstate` | Infrastructure layout. No keys, but not for a public-facing box |
| root `.env`, `.secrets` | Local configuration |
| `deploy/hetzner/*/.env` | Per-server production configuration |

All gitignored. Every deploy rsync must carry:

```
--exclude 'terraform/.ssh' --exclude 'terraform/*.tfstate*' --exclude '.env' --exclude 'deploy/hetzner/*/.env'
```

Audit both servers for stray copies with the loop in the
[deploy README](../deploy/hetzner/README.md#secrets-that-must-never-be-synced).

### Rotating the deployment key

**Do not swap the key and run `tofu apply`.** `hcloud_server.ssh_keys` is
`ForceNew` — Hetzner cannot change an existing server's keys, so editing it plans
a **server replacement** and destroys both machines and their data. Append the
new public key over the old connection, verify it, promote it, remove the old
one, and only then touch the project key — reviewing the plan first. Full
procedure in the deploy README.

CI should use a **dedicated** keypair in `HETZNER_SSH_KEY`, not the operator's.
