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
ensure_value "HARKBELL_POSTGRES_PASSWORD" "$(generate_secret)"
ensure_value "AUTH_SECRET" "$(generate_secret)"
ensure_value "DOGRAH_SERVICE_PASSWORD" "$(generate_secret)"
# Dograh reports turn_enabled only when TURN_SECRET is set, and the demo funnel
# gates its live call on that flag. Without it a local install cannot start a call.
ensure_value "TURN_SECRET" "$(generate_secret)"

vocalonix_database_password="$(awk -F= '$1 == "HARKBELL_POSTGRES_PASSWORD" { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE")"
vocalonix_database_url="$(awk -F= '$1 == "DATABASE_URL" { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE")"
if [[ -z "$vocalonix_database_url" || "$vocalonix_database_url" == "postgres://vocalonix:vocalonix@localhost:5433/vocalonix" ]]; then
  set_value "DATABASE_URL" "postgres://vocalonix:${vocalonix_database_password}@localhost:5433/vocalonix"
fi

# Provider keys stay empty on purpose — the operator pastes them. Writing the
# lines out means an .env created before these existed still shows every key
# there is to fill in, rather than the operator having to diff against the
# example file.
for placeholder in \
  VOICE_STACK DEEPGRAM_API_KEY OPENAI_API_KEY GEMINI_API_KEY \
  CARTESIA_API_KEY CARTESIA_VOICE_ID ELEVENLABS_API_KEY ELEVENLABS_VOICE_ID \
  TELNYX_API_KEY TELNYX_CONNECTION_ID TELNYX_WEBHOOK_PUBLIC_KEY \
  RESEND_API_KEY STRIPE_SECRET_KEY; do
  if ! grep -q "^${placeholder}=" "$ENV_FILE"; then
    printf '%s=\n' "$placeholder" >> "$ENV_FILE"
  fi
done
ensure_value "VOICE_STACK" "auto"

docker compose config >/dev/null

cat <<'MESSAGE'
Vocalonix is configured. Run ./scripts/start.sh to start the stack.

To make real calls work, put at least one speech key in .env:
  GEMINI_API_KEY=...                       quickest start
  DEEPGRAM_API_KEY=... OPENAI_API_KEY=...  recommended for launch

Optional: TELNYX_API_KEY for phone numbers, RESEND_API_KEY for real email.
After editing .env, restart the API. The dashboard's setup panel reports
whether each key was accepted.
MESSAGE
