# Vocalonix Hetzner deployment

Two-server Docker deployment for Vocalonix and Dograh on Hetzner Cloud.

## Layout

- `terraform/` — OpenTofu infrastructure (servers, network, firewall, SSH key).
- `deploy/hetzner/dograh/` — Dograh voice stack (`cx33`).
- `deploy/hetzner/vocalonix/` — Vocalonix web app (`cx23`).

## What is deployed

- **Dograh server** (`cx33`, 4 vCPU / 8 GB, Helsinki): Postgres, Redis, MinIO, Dograh API/UI, coturn (TURN), Caddy reverse proxy.
- **Vocalonix server** (`cx23`, 2 vCPU / 4 GB, Helsinki): Postgres, Vocalonix API, worker, web, Caddy reverse proxy.
- Both servers get automatic Let’s Encrypt certificates via `sslip.io`.

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
rsync -avz -e "ssh -i terraform/.ssh/id_ed25519" \
  --exclude .git --exclude .terraform --exclude node_modules --exclude dist \
  . root@<ip>:/opt/vocalonix/repo
```

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
