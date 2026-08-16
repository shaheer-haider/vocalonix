# Combined UX branch — end-to-end test report

Branch: `test/combined-ux` (merge of PR #43 workspace chrome cleanup, PR #44 billing/Stripe portal, PR #45 notifications-first page).
Tested on the local Docker Compose stack rebuilt from this branch HEAD (web bundle `index-COECUBgy.js`), migration 0013 applied.

## What you need to run it

- Docker + Compose; `git submodule update --init --recursive`, `./scripts/setup.sh`, then `docker compose up -d --build --wait`.
- Drizzle migration 0013 (adds `businesses.stripe_customer_id` / `plan_name`) — ran automatically via the Compose migrate step; verify with `\d businesses`.
- `STRIPE_SECRET_KEY` unset locally → billing UI shows the "not enabled" state (expected for this test).
- `MAX_OWNED_WORKSPACES` defaults to 3.

## What was tested — all passed

- **Workspace chrome (PR #43)**: sidebar has a "New workspace" button; no "Hear it now" link in the sidebar; the old main-area topbar (role pill, workspace name, topbar New workspace) is gone; no "Design preview" alerts on dashboard or billing.
- **New workspace limit**: with 1 owned workspace the button navigates to onboarding; after creating 2 more (3 owned) it shows a "Workspace limit reached" modal without navigating. Backend: workspace list returns `workspaceLimit: 3, canCreateWorkspace: false`; `POST /api/businesses` returns **403 WORKSPACE_LIMIT_REACHED**.
- **Configuration pages**: no "Dograh synchronization" section; no "line for line" / "Version N published" copy — verified in both draft and freshly-published states; no "Dograh" text anywhere in the customer UI (checked programmatically on every visited page).
- **Account & Billing (`/app/<slug>/account`)**: shows "Current plan: Free" and a disabled "Manage billing & subscription" button with the support note; no invoice list / sample billing data; no "Back to app" inside the card. `GET /api/b/<slug>/billing` → `{"configured":false,"plan":"Free"}`; `POST /api/b/<slug>/billing/portal` → **409 BILLING_NOT_CONFIGURED**.
- **Standalone `/account`**: "Back to app" appears in the page header only.
- **Notifications (PR #45)**: defaults to the inbox, newest first (18:20 → 07:42); "Settings" button toggles to the settings matrix and back; no "Design preview" alert, no "iPhone · Vocalonix app" row, no escalation-chain / after-hours / "Everyone else's settings" rails.
- **Contacts**: the list renders directly below the search bar and filter chips — **no notification-like block above the list** (the reported block could not be reproduced; the only element that can appear there is a load-error alert).
- **Navigation**: moving between Dashboard, Contacts, Callbacks, Notifications, Configuration and Account never blanks the shell to a full-page "Loading workspace…" spinner; single SPA navigation entry throughout.

## What is left / follow-ups

- **Minor API bug**: an invalid `POST /api/businesses` body (e.g. missing `slug`) surfaces as **500 "Unexpected server error"** instead of a 422 validation error. Worth mapping Elysia validation errors to 4xx.
- The account hub page (`/app`) still shows a "Hear it now" link — the task only required removing it from the workspace sidebar, but flag it if the intent was to remove all demo links from signed-in surfaces.
- Stripe-configured path (real portal redirect, plan names from Stripe) untested locally — needs a test `STRIPE_SECRET_KEY`.
- Notifications inbox is still static sample data; wiring it to real events is future work.

## Product suggestions

- In the workspace-limit modal, link "Contact support" to an actual mailto/support page.
- On the billing card, consider showing what the paid plans offer even while billing is unconfigured, so the upgrade intent isn't a dead end.
- The notifications inbox could deep-link each item (callback → callback detail, booking → diary).
- Consider a subtle per-page skeleton while workspace data refreshes in the background, so slow API responses stay visible to the user.
