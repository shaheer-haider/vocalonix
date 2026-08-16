#!/usr/bin/env bash
set -euo pipefail

# Usage: VOCALONIX_IP=... DOGRAH_IP=... bash generate-env.sh
# Defaults use the Hetzner outputs from the terraform run.
#
# ⚠️  THIS SCRIPT MINTS FRESH SECRETS ON EVERY RUN. It is for standing up a NEW
# deployment only. Running it against a live box rotates AUTH_SECRET (logging
# every user out), both Postgres passwords (breaking the database connection),
# and DOGRAH_SERVICE_PASSWORD (breaking the Dograh service login). To change a
# hostname on a running deployment, edit that box's .env in place instead.

VOCALONIX_IP="${VOCALONIX_IP:-62.238.101.107}"
DOGRAH_IP="${DOGRAH_IP:-62.238.109.55}"
VOCALONIX_PRIVATE_IP="${VOCALONIX_PRIVATE_IP:-10.0.1.2}"
DOGRAH_PRIVATE_IP="${DOGRAH_PRIVATE_IP:-10.0.1.3}"

# Public hostnames. These used to be derived from the IPs via sslip.io, which is
# what the boxes ran on before the domain existed. Set ROOT_DOMAIN= (empty) to
# get that behaviour back — useful for a throwaway box with no DNS.
ROOT_DOMAIN="${ROOT_DOMAIN-harkbell.com}"
if [ -n "$ROOT_DOMAIN" ]; then
  VOCALONIX_HOST="${VOCALONIX_HOST:-$ROOT_DOMAIN}"
  DOGRAH_HOST="${DOGRAH_HOST:-voice.$ROOT_DOMAIN}"
  ACME_EMAIL="${ACME_EMAIL:-hello@$ROOT_DOMAIN}"
else
  VOCALONIX_HOST="${VOCALONIX_HOST:-$(echo "$VOCALONIX_IP" | tr '.' '-').sslip.io}"
  DOGRAH_HOST="${DOGRAH_HOST:-$(echo "$DOGRAH_IP" | tr '.' '-').sslip.io}"
  ACME_EMAIL="${ACME_EMAIL:-nobody@sslip.io}"
fi

# The API refuses to boot when NODE_ENV=production and email verification is
# off (see app/api/src/env.ts). Deriving one from the other keeps a generated
# .env from producing a box that dies at startup with a validation error.
NODE_ENV_VALUE="${NODE_ENV:-development}"
if [ "$NODE_ENV_VALUE" = "production" ]; then
  REQUIRE_EMAIL_VERIFICATION_VALUE=true
else
  REQUIRE_EMAIL_VERIFICATION_VALUE="${REQUIRE_EMAIL_VERIFICATION:-false}"
fi

AUTH_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 24)
REDIS_PASSWORD=$(openssl rand -hex 24)
MINIO_ROOT_PASSWORD=$(openssl rand -hex 24)
TURN_SECRET=$(openssl rand -hex 32)
OSS_JWT_SECRET=$(openssl rand -hex 32)
DOGRAH_SERVICE_PASSWORD=$(openssl rand -hex 24)
VOCALONIX_POSTGRES_PASSWORD=$(openssl rand -hex 24)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cat > "$SCRIPT_DIR/dograh/.env" <<EOF
ACME_EMAIL=$ACME_EMAIL
TRAEFIK_NETWORK=traefik-proxy
TRAEFIK_CERTRESOLVER=letsencrypt
TRAEFIK_ENTRYPOINT=websecure

PUBLIC_HOST=$DOGRAH_HOST
PUBLIC_BASE_URL=https://$DOGRAH_HOST
TURN_HOST=$DOGRAH_IP
TURN_SECRET=$TURN_SECRET
ENABLE_COTURN=true
OSS_JWT_SECRET=$OSS_JWT_SECRET

POSTGRES_PASSWORD=$POSTGRES_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=$MINIO_ROOT_PASSWORD

DOGRAH_VERSION=latest
EOF

cat > "$SCRIPT_DIR/vocalonix/.env" <<EOF
ACME_EMAIL=$ACME_EMAIL
TRAEFIK_NETWORK=traefik-proxy
TRAEFIK_CERTRESOLVER=letsencrypt
TRAEFIK_ENTRYPOINT=websecure

VOCALONIX_POSTGRES_USER=vocalonix
VOCALONIX_POSTGRES_PASSWORD=$VOCALONIX_POSTGRES_PASSWORD
VOCALONIX_POSTGRES_DB=vocalonix

NODE_ENV=$NODE_ENV_VALUE
APP_ORIGIN=https://$VOCALONIX_HOST
API_PUBLIC_URL=https://$VOCALONIX_HOST
VOCALONIX_API_PUBLIC_URL=https://$VOCALONIX_HOST

AUTH_SECRET=$AUTH_SECRET
REQUIRE_EMAIL_VERIFICATION=$REQUIRE_EMAIL_VERIFICATION_VALUE
RESEND_API_KEY=
EMAIL_FROM=Harkbell <hello@$ROOT_DOMAIN>
MAGIC_LINK_TTL_SECONDS=300

DOGRAH_INTERNAL_URL=http://$DOGRAH_PRIVATE_IP:8000
DOGRAH_PUBLIC_API_URL=https://$DOGRAH_HOST
DOGRAH_WIDGET_URL=https://$VOCALONIX_HOST
DOGRAH_STORAGE_INTERNAL_URL=http://$DOGRAH_PRIVATE_IP:9000
DOGRAH_API_KEY=
DOGRAH_SERVICE_EMAIL=harkbell@$ROOT_DOMAIN
DOGRAH_SERVICE_PASSWORD=$DOGRAH_SERVICE_PASSWORD
DOGRAH_SERVICE_NAME=Harkbell
DOGRAH_WORKFLOW_NAME=Harkbell Agent
DOGRAH_WIDGET_ALLOWED_DOMAINS=$VOCALONIX_HOST

PUBLIC_HOST=$VOCALONIX_HOST
EOF

echo "Generated:"
echo "  - $SCRIPT_DIR/dograh/.env"
echo "  - $SCRIPT_DIR/vocalonix/.env"
