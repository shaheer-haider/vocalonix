# Vocalonix Hetzner deployment

Two-server Docker deployment for Vocalonix and Dograh on Hetzner Cloud.

## Layout

- `terraform/` — OpenTofu infrastructure (servers, network, firewall, SSH key).
- `deploy/hetzner/dograh/` — Dograh voice stack (`cx33`).
- `deploy/hetzner/vocalonix/` — Vocalonix web app (`cx23`).

## What is deployed

- **Dograh server** (`cx33`, 4 vCPU / 8 GB, Helsinki): Postgres, Redis, MinIO, Dograh API/UI, coturn (TURN), Caddy reverse proxy.
- **Vocalonix server** (`cx23`, 2 vCPU / 4 GB, Helsinki): Postgres, Vocalonix API, worker, web, Caddy reverse proxy.
- `harkbell.com` is proxied by Cloudflare, which terminates the browser's TLS;
  Caddy serves a Cloudflare Origin Certificate on that hop. `voice.harkbell.com`
  points straight at the Dograh box and gets a normal Let’s Encrypt certificate.

## First deploy

1. Apply the OpenTofu infrastructure:

```bash
cd terraform
export TF_VAR_hcloud_token=...
tofu init && tofu apply -auto-approve
```

2. Generate environment files:

```bash
cd deploy/hetzner
./generate-env.sh
```

3. Copy the repo (with submodules) to each server:

```bash
# run locally from the repo root
rsync -avz -e "ssh -i terraform/.ssh/id_ed25519 -o StrictHostKeyChecking=no" \
  --exclude .git --exclude .terraform --exclude node_modules --exclude dist \
  --exclude 'terraform/.ssh' --exclude 'terraform/*.tfstate*' \
  --exclude '.env' --exclude 'deploy/hetzner/*/.env' \
  . root@<ip>:/opt/vocalonix/repo
```

The last two exclude lines are not optional — see [Secrets that must never be
synced](#secrets-that-must-never-be-synced).

4. On the **Dograh** server:

```bash
cd /opt/vocalonix/repo
docker network create traefik-proxy || true
docker compose -f dograh/deploy/hostinger/docker-compose.yaml -f deploy/hetzner/dograh/docker-compose.override.yml --env-file deploy/hetzner/dograh/.env up -d
docker compose -f deploy/hetzner/dograh/docker-compose.caddy.yml --env-file deploy/hetzner/dograh/.env up -d
```

5. On the **Vocalonix** server:

```bash
cd /opt/vocalonix/repo/deploy/hetzner/vocalonix
# Add 2 GB swap so the build does not OOM on the small cx23
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
docker compose --env-file .env up -d --build
```

## Secrets that must never be synced

The deployment SSH keypair lives at `terraform/.ssh/id_ed25519`. It is created
out of band with `ssh-keygen` — OpenTofu does not generate it, it only reads
`.ssh/id_ed25519.pub` (`local.ssh_public_key` in `main.tf`) and registers it as
`hcloud_ssh_key`. That path is the private key's only home, it is gitignored via
`terraform/.ssh/`, and it stays on the operator's machine.

**One key grants root to both servers.** Copying it onto either one turns a file
read on that box into root on the whole deployment, so the rsync step must
exclude it.

Also exclude, for different reasons:

- `terraform/*.tfstate` — no private key or API token is stored in it, but it
  records infrastructure layout (server and network IDs, private IPs, firewall
  rules) that does not belong on a public-facing box.
- the root `.env` and `deploy/hetzner/*/.env` — each server keeps its own env
  file, and syncing yours overwrites production secrets with local ones.

Audit both servers for stray copies:

```bash
for ip in $(cd terraform && tofu output -raw vocalonix_public_ip) \
          $(cd terraform && tofu output -raw dograh_public_ip); do
  echo "=== $ip ==="
  ssh -i terraform/.ssh/id_ed25519 root@"$ip" \
    'find / -name "id_ed25519" -o -name "*.tfstate" 2>/dev/null | grep -v ^/proc || echo clean'
done
```

Anything listed should be deleted from the server.

### Rotating an exposed key

Do **not** just swap the key and run `tofu apply`. `hcloud_server.ssh_keys` is
`ForceNew` in the hcloud provider because the Hetzner API cannot change the keys
of an existing server — cloud-init writes `authorized_keys` only on first boot.
Editing it therefore plans a **server replacement**, destroying both servers and
their data. Rotate in this order instead:

```bash
# 1. new keypair (keep the old one until step 3 succeeds)
ssh-keygen -t ed25519 -N "" -C "vocalonix-$(date +%Y%m%d)" -f terraform/.ssh/id_ed25519_new

# 2. append the new public key on each server, using the OLD key to connect
for ip in <vocalonix-ip> <dograh-ip>; do
  ssh -i terraform/.ssh/id_ed25519 root@"$ip" \
    "printf '%s\n' '$(cat terraform/.ssh/id_ed25519_new.pub)' >> ~/.ssh/authorized_keys"
done

# 3. confirm the new key works, then promote it
ssh -i terraform/.ssh/id_ed25519_new root@<vocalonix-ip> 'echo ok'
mv terraform/.ssh/id_ed25519_new terraform/.ssh/id_ed25519
mv terraform/.ssh/id_ed25519_new.pub terraform/.ssh/id_ed25519.pub

# 4. remove the old public key from each server's authorized_keys
# 5. update the Hetzner project key so future servers get the new one:
#    review the plan first and confirm it does not replace the servers
cd terraform && tofu plan
```

If step 5 plans a replacement, do not apply it. Pin the existing servers first so
the key change only affects future ones:

```hcl
resource "hcloud_server" "vocalonix" {
  # ...
  lifecycle {
    ignore_changes = [ssh_keys]
  }
}
```

Access on the running servers is governed by `authorized_keys` (steps 2 and 4),
not by this attribute.

## Automatic deploys (GitHub Actions)

`.github/workflows/deploy.yml` deploys the Vocalonix server on every push to
`main` (and via manual `workflow_dispatch`): it rsyncs the repo with the
mandatory excludes above, runs `docker compose up -d --build --wait`, and then
checks `/api/health`, `/api/dograh/health`, and the served bundle.

It needs two things configured once in the GitHub repo:

1. An environment named `hetzner` (Settings → Environments) with these secrets:
   - `HETZNER_HOST` — the SSH target: the Vocalonix box's own address, e.g.
     `62.238.101.107`. It must reach the box directly, so it cannot be
     `harkbell.com` — that name resolves to Cloudflare, which proxies HTTP(S)
     only and will not carry SSH.
   - `HETZNER_PUBLIC_ORIGIN` — the public origin the health checks run
     against, including the scheme, e.g. `https://harkbell.com`. This has to
     be the proxied name rather than the box's address: the origin
     certificate Caddy serves is trusted by Cloudflare alone, so `curl`
     against the IP fails validation.
   - `HETZNER_SSH_KEY` — a private key whose public half is in the server's
     `~/.ssh/authorized_keys`. Prefer a **dedicated CI keypair** over the
     operator key in `terraform/.ssh/`:

     ```bash
     ssh-keygen -t ed25519 -N "" -C "vocalonix-ci" -f ci_deploy_key
     ssh -i terraform/.ssh/id_ed25519 root@<vocalonix-ip> \
       "printf '%s\n' '$(cat ci_deploy_key.pub)' >> ~/.ssh/authorized_keys"
     # paste ci_deploy_key into the HETZNER_SSH_KEY secret, then delete both files
     ```
   - `VOCALONIX_ENV` — the entire contents of the Vocalonix server's `.env`,
     as one secret. The deploy writes it to the box before starting the stack,
     which makes GitHub the one place that configuration is edited. See
     [Server configuration](#server-configuration) below.

The pipeline does not touch the Dograh server; use the manual steps below for it.

## Server configuration

The Vocalonix box's `.env` comes from the `VOCALONIX_ENV` secret. The deploy
installs it before starting the stack, so **edit the secret, not the file on the
box** — a hand-edit is undone by the next deploy, and while it survives it is
invisible to everyone else. The `--exclude 'deploy/hetzner/*/.env'` in the rsync
still stands and guards the other direction: an operator's laptop `.env` must
never reach a server.

Seed the secret from the **server's** current file, never from a local checkout.
Those two have diverged before — a local copy still said `NODE_ENV=development`
with no mail sender long after the box had been moved to production — and
seeding from the wrong one silently rolls production back:

```bash
ssh -i terraform/.ssh/id_ed25519 root@<vocalonix-ip> \
  'cat /opt/vocalonix/repo/deploy/hetzner/vocalonix/.env' | pbcopy
# paste into the VOCALONIX_ENV secret on the hetzner environment
```

Keep a copy somewhere you can read it back: GitHub secrets are write-only, so
once it is pasted the only readable copy is the file on the box. If you would
rather have configuration that is diffable and reviewable in git, the upgrade
path is [SOPS](https://github.com/getsops/sops) with an `age` key — the
encrypted `.env` lives in the repo and only the key sits in GitHub.

Before the secret exists the deploy logs a warning and leaves the box's file
alone, so nothing breaks in the meantime. It refuses to install a file that is
missing `AUTH_SECRET`, `APP_ORIGIN`, `API_PUBLIC_URL` or `EMAIL_FROM`, rather
than replacing a working configuration with one that cannot boot.

The Dograh box's `.env` is still managed by hand — the pipeline never deploys
that server.

## Redeploying a change

Infrastructure already exists, so a code change does **not** need `tofu apply`.
For a web-only change (anything under `app/web/`), rsync as in step 3 and then:

```bash
ssh -i terraform/.ssh/id_ed25519 root@<vocalonix-ip> \
  'cd /opt/vocalonix/repo/deploy/hetzner/vocalonix && docker compose --env-file .env up -d --build'
```

Compose recreates only the services whose image actually changed, so a CSS or
frontend change replaces `vocalonix-web` and leaves `vocalonix-api`, the worker,
the database, and Caddy running — no API downtime.

**A Caddyfile change is the exception, and it fails silently.** The file is
bind-mounted on its own (`./Caddyfile:/etc/caddy/Caddyfile`), so the mount is
pinned to an inode, and rsync replaces the file rather than editing it. After a
deploy the host path is a new inode while the container still serves the old
one; nothing in the container spec changed, so compose leaves it running, and
`caddy reload` re-reads the container's stale copy rather than the new file. The
edit deploys green and does nothing. The automatic deploy now recreates Caddy on
every run for this reason; after a manual rsync, do it yourself:

```bash
ssh -i terraform/.ssh/id_ed25519 root@<vocalonix-ip> \
  'cd /opt/vocalonix/repo/deploy/hetzner/vocalonix && docker compose -p vocalonix --env-file .env up -d --force-recreate --wait caddy'
```

Confirm the change actually took, rather than trusting the reload: request a
hostname the new config should no longer serve and expect the connection to
fail, not to answer.

Verify afterwards, and assert on the built asset rather than trusting a healthy
container, because a stale image still reports healthy:

```bash
curl -fsS https://<host>/api/health
curl -fsS https://<host>/api/dograh/health   # expect turnEnabled: true
# confirm the new bundle is being served
C=$(curl -sS https://<host>/ | grep -o 'assets/index-[^"]*\.css')
curl -sS "https://<host>/$C" | grep -c '<a marker from your change>'
```

## Switching to production

The default `.env` uses `NODE_ENV=development` and an empty `RESEND_API_KEY`. This lets users sign up with email + password, but magic links and verification emails are not sent.

To enable real email and production mode, set:

```env
NODE_ENV=production
RESEND_API_KEY=re_...
REQUIRE_EMAIL_VERIFICATION=true
EMAIL_FROM=Vocalonix <hello@yourdomain.com>
APP_ORIGIN=https://yourdomain.com
API_PUBLIC_URL=https://yourdomain.com
VOCALONIX_API_PUBLIC_URL=https://yourdomain.com
```

and point a real A record to the Vocalonix server IP.
