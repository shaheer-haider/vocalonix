---
name: testing-vocalonix-runtime
description: Test Vocalonix UI routes and Dograh-backed screens end-to-end in the supported local Compose runtime.
---

# Testing Vocalonix runtime

Use this skill for Vocalonix browser-route, settings, knowledge, and public-widget verification.

## Devin Secrets Needed

- None for route navigation, settings reads, knowledge-list reads, or public widget checks.
- `VOCALONIX_GEMINI_API_KEY` for a real Gemini Live spoken call.
- `VOCALONIX_OPENAI_API_KEY` only when the tested knowledge/embedding configuration requires OpenAI.

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

The API defaults `APP_ORIGIN` to `http://localhost:3000`. An ad hoc frontend preview on another port might produce browser `Failed to fetch` errors even while `/api/health` is healthy. Prefer the Compose web service. If another origin is necessary, configure `APP_ORIGIN` deliberately and rebuild the affected services.

## Route flow

1. Open `/` and verify it redirects to `/secret/test-agent`.
2. Navigate through Test Agent, Knowledge Base, and Agent Settings using the sidebar.
3. Verify each URL, heading, and active sidebar item.
4. Verify Agent Settings loads Dograh-backed fields and the website snippet.
5. Exercise browser Back and Forward.
6. Directly load and refresh `/secret/knowledge-base`.
7. Open `/secret` and verify its Test Agent redirect.
8. Open an unknown `/secret/*` path and verify a recovery action is available.
9. Open `/embed/dograh-widget.js` and verify it is JavaScript containing `window.DograhWidget`.

## Scope

Do not claim a successful voice call unless microphone access, audible agent output, interruption behavior, and a natural disconnect were all verified. Route and widget tests can be completed without provider secrets.
