#!/usr/bin/env bash
#
# Creates the Stripe products and monthly prices behind the plan catalogue in
# `app/api/src/billing/plans.ts`, and prints the two environment lines that turn
# them on.
#
# A plan whose price id is unset is simply not offered for purchase — that is
# the deliberate behaviour in `plans.ts`, and it is why harkbell.com currently
# shows "Talk to us" instead of a checkout button on Starter and Pro. This
# script closes that gap.
#
# It reads STRIPE_SECRET_KEY from the environment (falling back to .secrets or
# .env in the repo root) and never prints it. Run it yourself: the key stays on
# your machine.
#
#   ./scripts/stripe-bootstrap.sh
#
# Idempotent. Products and prices are tagged with `harkbell_plan` metadata and
# looked up by it, so running twice reuses what exists rather than creating a
# second $49 price that customers could land on.

set -euo pipefail

cd "$(dirname "$0")/.."

# --- Key -------------------------------------------------------------------

# The key may be recorded under any of these. `|| true` on every lookup
# matters: a `grep` that matches nothing exits non-zero, and under `set -e`
# that killed this script silently before it printed anything at all.
read_key() {
  local file="$1" name="$2"
  [ -f "$file" ] || return 0
  # Strip only quotes and CR — an earlier version fed `\r` to `tr -d` as two
  # separate characters and quietly deleted every letter `r` from the key.
  grep -E "^${name}=" "$file" 2>/dev/null | tail -1 | cut -d= -f2- \
    | tr -d '"'"'"'' | tr -d '\r' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' || true
}

if [ -z "${STRIPE_SECRET_KEY:-}" ]; then
  for candidate in .secrets .env deploy/hetzner/vocalonix/.env; do
    for name in STRIPE_SECRET_KEY STRIPE_API_KEY STRIPE_KEY STRIPE_SK; do
      value="$(read_key "$candidate" "$name")"
      if [ -n "${value:-}" ]; then
        STRIPE_SECRET_KEY="$value"
        echo "Using ${name} from ${candidate}"
        break 2
      fi
    done
  done
fi

if [ -z "${STRIPE_SECRET_KEY:-}" ]; then
  echo "No Stripe secret key found." >&2
  echo >&2
  # Names only, never values — this is the fastest way to see what the file
  # actually calls it without putting a key on the terminal.
  for candidate in .secrets .env deploy/hetzner/vocalonix/.env; do
    if [ -f "$candidate" ]; then
      names="$(grep -oE '^[A-Za-z_]*STRIPE[A-Za-z_]*=' "$candidate" 2>/dev/null | tr -d '=' | tr '\n' ' ' || true)"
      echo "  ${candidate}: ${names:-(no STRIPE_* entries)}" >&2
    fi
  done
  echo >&2
  echo "Export it and re-run:  STRIPE_SECRET_KEY=sk_... ./scripts/stripe-bootstrap.sh" >&2
  exit 1
fi

case "$STRIPE_SECRET_KEY" in
  sk_live_*|rk_live_*) MODE="LIVE" ;;
  sk_test_*|rk_test_*) MODE="TEST" ;;
  *) echo "STRIPE_SECRET_KEY does not look like a Stripe secret key." >&2; exit 1 ;;
esac

echo "Stripe mode: $MODE"

# Live mode creates a real, publicly purchasable product on the real account.
# That is what launch needs, but it should never happen because somebody ran a
# script without reading it.
if [ "$MODE" = "LIVE" ] && [ "${ASSUME_YES:-}" != "1" ]; then
  printf 'Create products on the LIVE Stripe account? [y/N] '
  read -r reply
  case "$reply" in
    [yY]*) ;;
    *) echo "Aborted. Nothing was created."; exit 0 ;;
  esac
fi

api() {
  local method="$1" path="$2"; shift 2
  local args=(--silent --show-error --fail-with-body -X "$method"
              -u "${STRIPE_SECRET_KEY}:" "https://api.stripe.com/v1${path}")
  local field
  for field in "$@"; do args+=(--data-urlencode "$field"); done
  curl "${args[@]}"
}

json() { python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get(sys.argv[1]) or "")' "$1"; }

# --- One plan --------------------------------------------------------------
#
# $1 plan id (must match a PlanId in plans.ts)
# $2 display name
# $3 amount in cents
# $4 description

provision() {
  local plan="$1" name="$2" amount="$3" description="$4"

  # A deterministic product id, fetched directly. The obvious alternative —
  # `/products/search` on metadata — is what the first version used, and it
  # created a duplicate set on every run: Stripe's search index is eventually
  # consistent, so a product created seconds ago is not there yet. A direct GET
  # is strongly consistent, so this is idempotent even back-to-back.
  local product="harkbell_${plan}"

  if api GET "/products/${product}" >/dev/null 2>&1; then
    echo "  reusing product  $product"
  else
    product="$(api POST "/products" \
      "id=harkbell_${plan}" \
      "name=${name}" \
      "description=${description}" \
      "metadata[harkbell_plan]=${plan}" | json id)"
    echo "  created product  $product"
  fi

  # A price is immutable in Stripe, so an amount change means a new price, not
  # an edit. Look for an active monthly one at exactly this amount.
  local price
  price="$(api GET "/prices?product=${product}&active=true&limit=100" \
    | python3 -c '
import sys, json
want = int(sys.argv[1])
data = json.load(sys.stdin).get("data", [])
for p in data:
    rec = p.get("recurring") or {}
    if (p.get("unit_amount") == want
            and rec.get("interval") == "month"
            and rec.get("interval_count") == 1
            and p.get("currency") == "usd"):
        print(p["id"]); break
else:
    print("")
' "$amount")"

  if [ -z "$price" ]; then
    price="$(api POST "/prices" \
      "product=${product}" \
      "unit_amount=${amount}" \
      "currency=usd" \
      "recurring[interval]=month" \
      "metadata[harkbell_plan]=${plan}" | json id)"
    echo "  created price    $price"
  else
    echo "  reusing price    $price"
  fi

  printf -v "PRICE_${plan}" '%s' "$price"
}

echo
echo "Starter — \$49/month"
provision starter "Harkbell Starter" 4900 \
  "AI receptionist for a single location: 500 answered minutes a month, one phone number, warm transfer to a person."

echo
echo "Pro — \$149/month"
provision pro "Harkbell Pro" 14900 \
  "AI receptionist for several locations: 2,000 answered minutes a month, up to 3 phone numbers, outbound callbacks."

echo
echo "───────────────────────────────────────────────────────────"
echo "Add these to the server environment, then redeploy:"
echo
echo "STRIPE_PRICE_STARTER=${PRICE_starter}"
echo "STRIPE_PRICE_PRO=${PRICE_pro}"
echo
echo "The server's .env comes from the VOCALONIX_ENV GitHub secret"
echo "(see .github/workflows/deploy.yml), so add the two lines there and"
echo "push, or re-run the deploy workflow."
echo
if [ "$MODE" = "TEST" ]; then
  echo "NOTE: these are TEST-mode price ids. They resolve only against the same"
  echo "test key. If the server runs a live key, checkout fails with \"No such"
  echo "price\" — re-run this with the live key to get the live ids."
  echo
fi
echo "Verify afterwards:"
echo "  curl -s https://harkbell.com/api/plans | grep -o '\"purchasable\":[a-z]*'"
echo "  # expect: false (Free, which has no price by design), then true, true"
echo "───────────────────────────────────────────────────────────"
