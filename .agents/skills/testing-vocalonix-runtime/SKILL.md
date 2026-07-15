---
name: testing-vocalonix-runtime
description: Test Vocalonix public, component, and Dograh-backed routes end-to-end in the supported local Compose runtime.
---

# Testing Vocalonix runtime

Use this skill for Vocalonix public/auth shells, UI primitives, browser routes,
settings, knowledge, and public-widget verification.

## Devin Secrets Needed

- None for local account, session, magic-link preview, route navigation,
  component behavior, settings reads, knowledge-list reads, or public widget
  checks. `scripts/setup.sh` generates local database and auth secrets.
- `RESEND_API_KEY` is only required to verify real production email delivery;
  local verification and magic-link flows intentionally return preview links.
- `VOCALONIX_GEMINI_API_KEY` for a real Gemini Live spoken call.
- `VOCALONIX_OPENAI_API_KEY` only when the tested knowledge/embedding
  configuration requires OpenAI.

Never print provider values or write them into tracked files.

## Setup

1. Initialize the Dograh submodule:
   ```bash
   git submodule update --init --recursive
   ```
2. Generate the local `.env` values:
   ```bash
   ./scripts/setup.sh
   ```
3. Build and start the full supported runtime:
   ```bash
   docker compose up -d --build --wait
   ```
   To exercise verification callbacks through local preview links:
   ```bash
   REQUIRE_EMAIL_VERIFICATION=true docker compose up -d --build --wait
   ```
4. Confirm every Compose service is running and healthy:
   ```bash
   docker compose ps
   ```
5. Confirm the Vocalonix API and Dograh integration:
   ```bash
   curl -fsS http://localhost:3001/api/health
   curl -fsS http://localhost:3001/api/dograh/status
   ```
6. Test the browser at `http://localhost:3000`.

The API defaults `APP_ORIGIN` to `http://localhost:3000`. An ad hoc frontend
preview on another port might produce browser `Failed to fetch` errors even
while `/api/health` is healthy. Prefer the Compose web service. If another
origin is necessary, configure `APP_ORIGIN` deliberately and rebuild the
affected services.

## Account and session flow

1. Start signed out and open `/account`. Verify the login URL preserves
   `redirect=/account`.
2. Create a unique account. With verification enabled, use the local preview
   and verify the callback before continuing.
3. Open `/app` in a fresh tab and verify the user restores from the HTTP-only
   cookie rather than browser storage.
4. Open `/account` and verify the active-session count and `This browser`
   label.
5. Log out, reopen `/account`, and verify password login returns to the
   preserved route.
6. To create a second database session without another browser profile, open
   `/login` while authenticated and log in again. `/account` should show one
   current and one other session.
7. Use `Log out everywhere`, sign in once more, and verify only one active
   session remains.
8. Request a local magic-link preview for the existing account. Consume it
   once, reload the callback to verify `Link already used`, and use an unknown
   token to verify `Invalid link`.
9. For an expired-link check, prepare a local preview token and move its
   matching `magic_link_requests.expires_at` into the past in
   `vocalonix-db`; the callback should show `Link expired`.

When entering long callback URLs through computer use, focus the address bar,
type the full URL in a separate action, then press Enter. Combining focus and
typing can occasionally drop the leading character.

## Public and component regression

1. Open `/` and verify it remains the public landing page rather than
   redirecting to `/secret`.
2. Open `/design-system`.
3. Verify the dropdown supports keyboard selection, Escape, and outside-click
   close.
4. Verify the modal focuses its first control, traps Tab/Shift+Tab, closes with
   Escape and backdrop clicks, and restores focus to its trigger.

## Dograh route flow

1. Open `/secret/test-agent` and verify the connected Dograh status and embedded
   call control without starting audio unless spoken-call testing is in scope.
2. Navigate through Test Agent, Knowledge Base, and Agent Settings using the
   sidebar.
3. Verify each URL, heading, and active sidebar item.
4. Verify Agent Settings loads Dograh-backed fields and the website snippet.
5. Exercise browser Back and Forward where navigation behavior changed.
6. Directly load and refresh a nested `/secret/*` route.
7. Open `/secret` and verify its Test Agent redirect.
8. Open an unknown `/secret/*` path and verify a recovery action is available.
9. Open `/embed/dograh-widget.js` and verify it is JavaScript containing
   `window.DograhWidget`.

If Chrome autocompletes a previously visited nested route while entering `/`,
open `http://localhost:3000/?route-check`, then click the Vocalonix wordmark to
normalize the URL before asserting the root route.

## Workspace and invitation flow

1. Create two unique accounts and use one as the workspace Owner.
2. Create two businesses through `/app/onboarding/create`. On a nested
   `/app/:slug/team` route, switch workspaces and verify the `/team` tail is
   preserved.
3. Verify the sole active Owner cannot be revoked or downgraded.
4. Invite the second account as Admin. Verify one pending row, duplicate
   rejection, resend, and the local preview URL.
5. Open the preview as the Owner and verify the explicit email-mismatch state.
   Log out, reopen the same URL, log in as the Invitee, and accept it.
6. Verify the Invitee can access only the invited business and the used token
   renders `accepted` without an acceptance action.
7. Before browser role mutations, verify the API preflight includes `PATCH`:
   ```bash
   curl -isS -X OPTIONS \
     http://localhost:3001/api/b/example/team/example \
     -H 'Origin: http://localhost:3000' \
     -H 'Access-Control-Request-Method: PATCH' \
     -H 'Access-Control-Request-Headers: content-type'
   ```
8. Change Admin to Viewer in the browser. Verify Team is absent from navigation,
   agent/team dashboard actions are absent, and direct `/team` access is denied.
9. Revoke the Viewer, reinvite the same email as Staff, and accept again. Verify
   the existing revoked membership is reactivated as active Staff.
10. Verify revoked, expired, and invalid public invitation states. Expired
    local fixtures should store only a SHA-256 token hash, matching production
    lookup behavior.
11. Confirm persistence after the UI flow:
    ```bash
    docker compose exec -T vocalonix-db \
      psql -U vocalonix -d vocalonix
    ```
    Check active memberships, invitation lifecycle timestamps, one Dograh
    mapping and pending outbox event per business, and audit actions for every
    mutation.

## Scope

Do not claim a successful voice call unless microphone access, audible agent
output, interruption behavior, and a natural disconnect were all verified.
Route and widget tests can be completed without provider secrets.
