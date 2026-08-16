# Vocalonix MVP — end-to-end test report & readiness notes

_Tested on branch `devin/1786697236-mvp-launch-readiness` (PR #42), local Docker Compose stack, 2026-08-14._

## What you need to run it

- Docker + Docker Compose, Bun (for local dev commands).
- One-time: `git submodule update --init --recursive` (Dograh), then `./scripts/setup.sh`.
- Start everything: `docker compose up -d --build --wait` (add `REQUIRE_EMAIL_VERIFICATION=true` to exercise the verification flow).
- Sanity checks: `GET /api/health` → `{"status":"ok"}`; `GET /api/dograh/health` → `turnEnabled: true` for live calls.
- Optional secrets for real voice calls: Gemini / OpenAI API keys configured in the Dograh UI.

## What was tested and works

- **Email verification (new)** — with `REQUIRE_EMAIL_VERIFICATION=true`:
  - Signup does not log you in; it shows a warning "Email delivery is disabled locally. Use the verification preview." with a working local preview link.
  - Opening the link shows "Email verified" and lets you continue into the app.
  - A bogus token shows "Invalid token" with a return-to-login link.
- **Contacts pagination (new)** — imported 220 contacts via CSV; the list loads the first 200, shows a ghost "Load more" button, and clicking it appends contacts 201–220 (220 unique rows, no duplicates) and removes the button.
- **Callbacks page** — renders normally; creating a callback by hand works and shows in the queue with owner/due-back controls.
- **Knowledge page** — document upload enters `pending` and the list auto-refreshes (4s poll) to `active` without clicking Refresh. Dograh de-duplication errors surface inline on the failed row.
- **CSV contact import** — 220-row file imported in one go with a clear success toast.
- Previously verified (PR #41): SPA navigation without reloads, 10 MB + magic-byte upload validation, worker outbox processing and clean SIGTERM shutdown, golden path landing → signup → onboarding → dashboard.

## What is left / follow-ups

- **Reused verification link shows "Email verified" again** instead of an "already used" notice. Harmless (idempotent) but potentially confusing; decide if a distinct message is wanted.
- **Verification auto-signs the user in** after consuming the link — confirm this is the intended UX (vs. requiring an explicit login).
- Callbacks and Knowledge "Load more" buttons exist but were not exercised with >200 rows (no practical way to seed that many via the UI); backend uses the same `paginate()` helper as contacts.
- No "resend verification email" option if the user loses the link.
- Real spoken call (STT/LLM/TTS) not re-tested in this run.
- Production email delivery (Resend) untested — only local preview links verified.

## Product suggestions

- Add search/filter to the contacts list server-side — with 200+ contacts the client-side search only covers loaded pages.
- Show a total count next to "Load more" (e.g. "Showing 200 of 512") so users know how much is left.
- Replace the raw duplicate-file error from Dograh with a friendlier message and a link to the conflicting item.
- Offer a "Resend verification email" button on the login page for unverified accounts.
- Consider infinite scroll instead of a button for contacts, since the list pane already scrolls.
- Surface CSV import errors per-row (currently rows without name/phone/email are silently dropped).
