#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
EXAMPLE_FILE="$ROOT_DIR/.env.example"

cd "$ROOT_DIR"
git submodule update --init --recursive

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$EXAMPLE_FILE" "$ENV_FILE"
fi

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    python3 -c 'import secrets; print(secrets.token_hex(32))'
  fi
}

set_value() {
  local key="$1"
  local value="$2"
  local temp_file="${ENV_FILE}.tmp"

  awk -v key="$key" -v value="$value" '
    BEGIN { updated = 0 }
    index($0, key "=") == 1 { print key "=" value; updated = 1; next }
    { print }
    END { if (!updated) print key "=" value }
  ' "$ENV_FILE" > "$temp_file"
  mv "$temp_file" "$ENV_FILE"
}

ensure_value() {
  local key="$1"
  local fallback="$2"
  local current
  current="$(awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE")"
  if [[ -z "$current" ]]; then
    set_value "$key" "$fallback"
  fi
}

ensure_value "OSS_JWT_SECRET" "$(generate_secret)"
ensure_value "POSTGRES_PASSWORD" "$(generate_secret)"
ensure_value "REDIS_PASSWORD" "$(generate_secret)"
ensure_value "MINIO_ROOT_USER" "vocalonix$(generate_secret | cut -c1-12)"
ensure_value "MINIO_ROOT_PASSWORD" "$(generate_secret)"

docker compose config >/dev/null
echo "Vocalonix is configured. Run ./scripts/start.sh to start the stack."
