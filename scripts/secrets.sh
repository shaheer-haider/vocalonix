#!/usr/bin/env bash
#
# Secrets, from Infisical.
#
# Before this, each box's whole `.env` lived in one GitHub secret. GitHub
# secrets are write-only, so nobody — including whoever set it — could read back
# what was in there. Changing one line meant re-pasting the entire file from a
# copy you hoped was current, with no diff and no history. That is how
# `STRIPE_PRICE_STARTER` could be "added" and silently never arrive.
#
# Infisical is now the one place a value is edited. The deploy pulls the whole
# `/be` folder itself, so a new key needs no workflow or compose change.
# This script is the same thing by hand: migrating values in, checking what is
# set, and running something locally with them injected.
#
# Folders: /be is the Harkbell app box, /voice is the Dograh box, /tls is the
# origin certificate the app box's Caddy serves, /ui is the web build. Each box
# has its own pipeline — the app deploys on push, the voice box by hand, because
# restarting it cuts every call in flight.
#
#   ./scripts/secrets.sh pull  harkbell|dograh        write that box's .env
#   ./scripts/secrets.sh push  harkbell|dograh FILE   one-time migration in
#   ./scripts/secrets.sh check harkbell|dograh        names only, no values
#   ./scripts/secrets.sh run   harkbell -- CMD        run CMD with them injected
#   ./scripts/secrets.sh merge TARGET SOURCE            fill TARGET's REPLACE_ME
#                                                       values from SOURCE
#   ./scripts/secrets.sh tls   CERT.pem KEY.pem         upload the origin cert
#
# Auth: `infisical login`, or export INFISICAL_TOKEN (machine identity) and
# INFISICAL_PROJECT_ID.
#
# Requires: infisical  (brew install infisical/get-cli/infisical)

set -euo pipefail

# Captured before the cd: file arguments are relative to wherever the caller
# ran this from, not to the repo root, and resolving them afterwards silently
# reported "does not exist" for a file sitting right next to them.
ORIG_PWD="$PWD"
cd "$(dirname "$0")/.."

resolve() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *)  printf '%s/%s\n' "$ORIG_PWD" "$1" ;;
  esac
}

ENVIRONMENT="${INFISICAL_ENV:-prod}"

# Infisical rejects a secret with an empty value, so a key that is deliberately
# unset would simply not appear — and an invisible key is one nobody remembers
# to fill in. `push` writes this placeholder instead, so every key the app knows
# about is listed in the UI with somewhere obvious to type.
#
# It is stripped back out by `pull` and by the deploy, which matters more than it
# looks: the placeholder is a non-empty string, and `env.ts` reads any non-empty
# value as real. `TELNYX_API_KEY=REPLACE_ME` would report telephony as
# configured and fail on the first call; `STRIPE_SECRET_KEY=REPLACE_ME` would
# turn billing on and 502 at checkout. A key still holding it has to reach a
# server as absent, exactly as it is today.
PLACEHOLDER="REPLACE_ME"

command -v infisical >/dev/null 2>&1 || {
  echo "infisical is not installed. brew install infisical/get-cli/infisical" >&2
  exit 1
}

# Each box gets its own folder rather than one flat namespace, because they
# share almost nothing and a flat namespace hands the Dograh box Stripe keys it
# has no business holding.
box_path() {
  case "$1" in
    harkbell) echo "/be" ;;
    dograh)   echo "/voice" ;;
    *) echo "Unknown box '$1'. Use 'harkbell' or 'dograh'." >&2; exit 1 ;;
  esac
}

box_envfile() {
  case "$1" in
    # The directory is still named vocalonix — it is the compose project path
    # on the box, not a label anyone reads.
    harkbell) echo "deploy/hetzner/vocalonix/.env" ;;
    dograh)   echo "deploy/hetzner/dograh/.env" ;;
  esac
}

# Keys without which the stack boots into a broken state rather than failing
# loudly — a half-populated environment reports as a health-check timeout ten
# minutes later, which is the slowest possible way to learn about it.
required_keys() {
  case "$1" in
    harkbell) echo "AUTH_SECRET APP_ORIGIN API_PUBLIC_URL EMAIL_FROM" ;;
    dograh)   echo "" ;;
  esac
}

# Populates the global INF_ARGS. A global rather than something read back down a
# pipe because macOS ships bash 3.2, which has no `mapfile` — reading args with
# it produced a silently EMPTY array, so every command would have run with no
# --env, --path or --token and quietly hit the wrong project.
INF_ARGS=()
set_infisical_args() {
  INF_ARGS=(--env="$ENVIRONMENT" --path="$(box_path "$1")" --silent)
  [ -n "${INFISICAL_TOKEN:-}" ] && INF_ARGS+=(--token="$INFISICAL_TOKEN")
  [ -n "${INFISICAL_PROJECT_ID:-}" ] && INF_ARGS+=(--projectId="$INFISICAL_PROJECT_ID")
  return 0
}

SCRATCH=""
cleanup() { rm -f "${SCRATCH:-}" 2>/dev/null; return 0; }
trap cleanup EXIT INT TERM

cmd_pull() {
  local box="${1:?usage: secrets.sh pull harkbell|dograh}"
  local dest; dest="$(box_envfile "$box")"
  set_infisical_args "$box"

  # umask, not a later chmod: between creation and chmod the file would be
  # readable by anyone else on the machine.
  SCRATCH="$(mktemp)"
  ( umask 077; infisical export "${INF_ARGS[@]}" --format=dotenv > "$SCRATCH" )

  # `export --format=dotenv` single-quotes every value, and docker's --env-file
  # keeps those quotes literal — NODE_ENV='production' reaches the app as
  # "'production'". Strip one layer of matching quotes.
  sed -i.bak -E "s/^([A-Za-z_][A-Za-z0-9_]*)='(.*)'\$/\\1=\\2/" "$SCRATCH" && rm -f "$SCRATCH.bak"

  # Strip placeholders before anything can read them as real values.
  local pending
  pending="$(grep -E "^[A-Za-z_][A-Za-z0-9_]*=${PLACEHOLDER}$" "$SCRATCH" | cut -d= -f1 | tr '\n' ' ' || true)"
  if [ -n "$pending" ]; then
    echo "Still unset in Infisical (dropped): $pending"
    sed -i.bak -E "/^[A-Za-z_][A-Za-z0-9_]*=${PLACEHOLDER}$/d" "$SCRATCH" && rm -f "$SCRATCH.bak"
  fi

  local missing=""
  for key in $(required_keys "$box"); do
    grep -qE "^${key}=" "$SCRATCH" || missing="$missing $key"
  done
  if [ -n "$missing" ]; then
    echo "Refusing to write $dest — Infisical has no real value for:$missing" >&2
    exit 1
  fi

  mkdir -p "$(dirname "$dest")"
  cp "$SCRATCH" "$dest"
  chmod 600 "$dest"
  echo "Wrote $dest — $(grep -cE '^[A-Za-z_]' "$dest") values from $(box_path "$box") @ $ENVIRONMENT"
}

cmd_push() {
  local box="${1:?usage: secrets.sh push harkbell|dograh FILE}"
  local file; file="$(resolve "${2:?usage: secrets.sh push harkbell|dograh FILE}")"
  [ -f "$file" ] || { echo "$file does not exist." >&2; exit 1; }
  set_infisical_args "$box"

  # Infisical refuses an empty value and refuses the whole batch on the first
  # one, so a `.env` with a single unused `TELNYX_API_KEY=` used to abort the
  # migration partway. Empty values become the placeholder instead: the key
  # shows up in the UI to be filled in, and `pull` and the deploy strip it back
  # to absent so nothing ever receives it as a real value.
  SCRATCH="$(mktemp)"
  ( umask 077
    sed -E "s/^([A-Za-z_][A-Za-z0-9_]*)=[[:space:]]*$/\\1=${PLACEHOLDER}/" "$file" \
      | grep -E '^[A-Za-z_][A-Za-z0-9_]*=.+' > "$SCRATCH" || true )

  local blanked
  blanked="$(grep -E '^[A-Za-z_][A-Za-z0-9_]*=[[:space:]]*$' "$file" | cut -d= -f1 | tr '\n' ' ' || true)"
  [ -n "$blanked" ] && echo "Empty -> ${PLACEHOLDER}: $blanked"

  echo "Uploading $(grep -c '=' "$SCRATCH") values from $file → $(box_path "$box") @ $ENVIRONMENT"
  # Values are never printed: `secrets set` masks them unless --show-values.
  infisical secrets set "${INF_ARGS[@]}" --file "$SCRATCH" >/dev/null
  echo "Done. Verify with: ./scripts/secrets.sh check $box"
}

cmd_check() {
  local box="${1:?usage: secrets.sh check harkbell|dograh}"
  set_infisical_args "$box"

  SCRATCH="$(mktemp)"
  ( umask 077; infisical export "${INF_ARGS[@]}" --format=dotenv > "$SCRATCH" )

  echo "$(box_path "$box") @ $ENVIRONMENT"
  # Names only — this is the command that is safe to run with somebody watching.
  sed -E "s/^([A-Za-z_][A-Za-z0-9_]*)=${PLACEHOLDER}$/\\1  <- still ${PLACEHOLDER}/; s/^([A-Za-z_][A-Za-z0-9_]*)=.*/\\1/" "$SCRATCH" | sort | sed 's/^/  /'

  local missing=""
  for key in $(required_keys "$box"); do
    grep -qE "^${key}=" "$SCRATCH" || missing="$missing $key"
  done
  if [ -n "$missing" ]; then echo "MISSING:$missing" >&2; exit 1; fi
  echo "All required keys present."
}

cmd_run() {
  local box="${1:?usage: secrets.sh run harkbell -- CMD}"; shift
  [ "${1:-}" = "--" ] && shift
  [ "$#" -gt 0 ] || { echo "usage: secrets.sh run harkbell -- CMD" >&2; exit 1; }
  set_infisical_args "$box"
  exec infisical run "${INF_ARGS[@]}" -- "$@"
}

# Fills only the keys still holding the placeholder, and only from keys the
# source actually has. Deliberately one-directional: it never overwrites a value
# already filled in, so re-running after a partial merge cannot clobber
# something you typed by hand.
cmd_merge() {
  local target; target="$(resolve "${1:?usage: secrets.sh merge TARGET SOURCE}")"
  local source; source="$(resolve "${2:?usage: secrets.sh merge TARGET SOURCE}")"
  [ -f "$target" ] || { echo "$target does not exist." >&2; exit 1; }
  [ -f "$source" ] || { echo "$source does not exist." >&2; exit 1; }

  local filled=0 missing=""
  while IFS= read -r key; do
    local val
    val="$(grep -E "^${key}=" "$source" | tail -1 | cut -d= -f2- || true)"
    if [ -n "$val" ]; then
      SCRATCH="$(mktemp)"; chmod 600 "$SCRATCH"
      while IFS= read -r line; do
        case "$line" in
          "${key}=REPLACE_ME") printf '%s=%s\n' "$key" "$val" ;;
          *) printf '%s\n' "$line" ;;
        esac
      done < "$target" > "$SCRATCH"
      cat "$SCRATCH" > "$target"; rm -f "$SCRATCH"; SCRATCH=""
      filled=$((filled + 1))
      echo "  filled $key"
    else
      missing="$missing $key"
    fi
  done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=REPLACE_ME$' "$target" | cut -d= -f1)

  echo "Filled $filled from $source."
  [ -n "$missing" ] && echo "Still unset (not in $source):$missing"
  return 0
}

# Uploads the origin certificate pair to /tls, base64-encoded because dotenv is
# a one-line-per-value format and a PEM is not. Checks the pair matches first:
# an unrelated cert and key upload perfectly happily and then fail on the box as
# a Caddy startup error that reads like a network fault.
cmd_tls() {
  local cert; cert="$(resolve "${1:?usage: secrets.sh tls CERT.pem KEY.pem}")"
  local key;  key="$(resolve "${2:?usage: secrets.sh tls CERT.pem KEY.pem}")"
  [ -f "$cert" ] || { echo "$cert does not exist." >&2; exit 1; }
  [ -f "$key" ]  || { echo "$key does not exist." >&2; exit 1; }

  local cert_pub key_pub
  cert_pub="$(openssl x509 -in "$cert" -noout -pubkey 2>/dev/null | openssl sha256)"
  key_pub="$(openssl pkey -in "$key" -pubout 2>/dev/null | openssl sha256)"
  if [ -z "$cert_pub" ] || [ "$cert_pub" != "$key_pub" ]; then
    echo "$cert and $key are not a matching pair. Refusing to upload." >&2
    exit 1
  fi
  openssl x509 -in "$cert" -noout -checkend 0 >/dev/null 2>&1 || {
    echo "$cert has already expired. Refusing to upload." >&2; exit 1; }

  INF_ARGS=(--env="$ENVIRONMENT" --path=/tls --silent)
  [ -n "${INFISICAL_TOKEN:-}" ] && INF_ARGS+=(--token="$INFISICAL_TOKEN")
  [ -n "${INFISICAL_PROJECT_ID:-}" ] && INF_ARGS+=(--projectId="$INFISICAL_PROJECT_ID")

  # `base64 -w0` is GNU; macOS has no -w and wraps by default, so fold the
  # newlines out afterwards instead of guessing which base64 this is.
  SCRATCH="$(mktemp)"
  ( umask 077
    printf 'ORIGIN_CERT_B64=%s\n' "$(base64 < "$cert" | tr -d '\n')" >  "$SCRATCH"
    printf 'ORIGIN_KEY_B64=%s\n'  "$(base64 < "$key"  | tr -d '\n')" >> "$SCRATCH" )

  echo "Uploading the origin pair to /tls @ $ENVIRONMENT"
  echo "  valid until $(openssl x509 -in "$cert" -noout -enddate | cut -d= -f2)"
  infisical secrets set "${INF_ARGS[@]}" --file "$SCRATCH" >/dev/null
  rm -f "$SCRATCH"; SCRATCH=""
  echo "Done. The next deploy installs it; the box is never touched by hand."
}

case "${1:-}" in
  pull)  shift; cmd_pull "$@" ;;
  tls)   shift; cmd_tls "$@" ;;
  merge) shift; cmd_merge "$@" ;;
  push)  shift; cmd_push "$@" ;;
  check) shift; cmd_check "$@" ;;
  run)   shift; cmd_run "$@" ;;
  *) sed -n '3,27p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
