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
# `/harkbell` folder itself, so a new key needs no workflow or compose change.
# This script is the same thing by hand: migrating values in, checking what is
# set, and running something locally with them injected.
#
# The Dograh box is not wired up yet — `pull dograh` works, but nothing
# populates `/dograh` and the pipeline does not touch that server.
#
#   ./scripts/secrets.sh pull  dograh|vocalonix        write that box's .env
#   ./scripts/secrets.sh push  dograh|vocalonix FILE   one-time migration in
#   ./scripts/secrets.sh check dograh|vocalonix        names only, no values
#   ./scripts/secrets.sh run   vocalonix -- CMD        run CMD with them injected
#
# Auth: `infisical login`, or export INFISICAL_TOKEN (machine identity) and
# INFISICAL_PROJECT_ID.
#
# Requires: infisical  (brew install infisical/get-cli/infisical)

set -euo pipefail

cd "$(dirname "$0")/.."

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
    vocalonix) echo "/harkbell" ;;
    dograh)    echo "/dograh" ;;
    *) echo "Unknown box '$1'. Use 'vocalonix' or 'dograh'." >&2; exit 1 ;;
  esac
}

box_envfile() {
  case "$1" in
    vocalonix) echo "deploy/hetzner/vocalonix/.env" ;;
    dograh)    echo "deploy/hetzner/dograh/.env" ;;
  esac
}

# Keys without which the stack boots into a broken state rather than failing
# loudly — a half-populated environment reports as a health-check timeout ten
# minutes later, which is the slowest possible way to learn about it.
required_keys() {
  case "$1" in
    vocalonix) echo "AUTH_SECRET APP_ORIGIN API_PUBLIC_URL EMAIL_FROM" ;;
    dograh)    echo "" ;;
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
  local box="${1:?usage: secrets.sh pull dograh|vocalonix}"
  local dest; dest="$(box_envfile "$box")"
  set_infisical_args "$box"

  # umask, not a later chmod: between creation and chmod the file would be
  # readable by anyone else on the machine.
  SCRATCH="$(mktemp)"
  ( umask 077; infisical export "${INF_ARGS[@]}" --format=dotenv > "$SCRATCH" )

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
  local box="${1:?usage: secrets.sh push dograh|vocalonix FILE}"
  local file="${2:?usage: secrets.sh push dograh|vocalonix FILE}"
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
  local box="${1:?usage: secrets.sh check dograh|vocalonix}"
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
  local box="${1:?usage: secrets.sh run vocalonix -- CMD}"; shift
  [ "${1:-}" = "--" ] && shift
  [ "$#" -gt 0 ] || { echo "usage: secrets.sh run vocalonix -- CMD" >&2; exit 1; }
  set_infisical_args "$box"
  exec infisical run "${INF_ARGS[@]}" -- "$@"
}

case "${1:-}" in
  pull)  shift; cmd_pull "$@" ;;
  push)  shift; cmd_push "$@" ;;
  check) shift; cmd_check "$@" ;;
  run)   shift; cmd_run "$@" ;;
  *) sed -n '3,27p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
