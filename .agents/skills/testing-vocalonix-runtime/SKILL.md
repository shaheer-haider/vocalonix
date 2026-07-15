---
name: testing-vocalonix-runtime
description: Test Vocalonix public, component, and Dograh-backed routes end-to-end in the supported local Compose runtime.
---

# Testing Vocalonix runtime

Use this skill for Vocalonix public/auth shells, UI primitives, browser routes,
settings, knowledge, and public-widget verification.

## Devin Secrets Needed

- None for route navigation, client-side auth validation, component behavior,
  settings reads, knowledge-list reads, or public widget checks.
- `VOCALONIX_GEMINI_API_KEY` for a real Gemini Live spoken call.
- `VOCALONIX_OPENAI_API_KEY` only when the tested knowledge/embedding
  configuration requires OpenAI.

Never print provider values or write them into tracked files.

## Setup

1. Initialize the Dograh submodule:
   ```bash
   git submodule update --init --recursive
   ```
2. Build and start the full supported runtime:
   ```bash
   docker compose up -d --build
   ```
3. Confirm every Compose service is running and healthy:
   ```bash
   docker compose ps
   ```
4. Confirm the Vocalonix API and Dograh integration:
   ```bash
   curl -fsS http://localhost:3001/api/health
   curl -fsS http://localhost:3001/api/dograh/status
   ```
5. Test the browser at `http://localhost:3000`.

The API defaults `APP_ORIGIN` to `http://localhost:3000`. An ad hoc frontend
preview on another port might produce browser `Failed to fetch` errors even
while `/api/health` is healthy. Prefer the Compose web service. If another
origin is necessary, configure `APP_ORIGIN` deliberately and rebuild the
affected services.

## Public and component flow

1. Open `/` and verify it remains the public landing page rather than
   redirecting to `/secret`.
2. Navigate to `/signup` and `/login`.
3. Verify invalid values render inline client-side validation.
4. Verify valid submissions remain on the same route and clearly state that
   authentication/account sessions are deferred. Do not treat these forms as a
   successful login or signup.
5. Open `/design-system`.
6. Verify the dropdown supports keyboard selection, Escape, and outside-click
   close.
7. Verify the modal focuses its first control, traps Tab/Shift+Tab, closes with
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

## Scope

Do not claim a successful voice call unless microphone access, audible agent
output, interruption behavior, and a natural disconnect were all verified.
Route and widget tests can be completed without provider secrets.
