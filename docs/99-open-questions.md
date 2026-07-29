# Open questions and verification notes

This document captures things that were not verified, ambiguous, or should be re-checked as the project evolves.

## Verified during this pass

| Command | Result |
|---|---|
| `bun install --frozen-lockfile` | Passed with Bun 1.3.0 (lockfile target is 1.1.45). |
| `bun run db:migrate` | Passed against a running `vocalonix-db` on port 5433. |
| `bun run test` | 23 pass, 0 fail, 188 expect() calls. |
| `bun run typecheck` | Both `app/api` and `app/web` clean. |
| `bun run build` | Both `app/api` and `app/web` built; `dist` emitted. |
| `curl http://localhost:3001/api/health` | `{"status":"ok","service":"vocalonix-api"}`. |
| `curl http://localhost:3001/api/dograh/status` | Connected, Dograh 1.41.0, legacy workflow active. |
| `curl http://localhost:3000` | Returned `index.html` and built assets. |
| `docker compose ps` | All seven services healthy. |

## Verified in later passes

- **Multi-business workflow isolation** — Two businesses received distinct workflows with matching `metadata.vocalonix.business_id`, each workflow references only its own knowledge documents, cross-tenant API access is denied, a `business_dograh_workflow_id_unique` constraint prevents shared mappings, and offboarding one business archives only its workflow and documents.
- **Widget call in a real browser** — A published widget completed a real WebRTC browser call (microphone capture, audible agent output answering from the correct business's knowledge, clean `user_hangup` disconnect). Mid-speech interruption was not conclusively exercised.

## Unverified / ambiguous

1. **Email delivery in production** — Only preview URLs were verified in local dev. `RESEND_API_KEY` and real domain verification are not tested.
2. **Magic link and verification flows** — The endpoints return and consume tokens, but an actual full email cycle was not performed.
3. **Document processing through Dograh** — The knowledge upload and worker poll cycle was verified by code inspection, but a real PDF upload and processing was not run end-to-end.
4. **Role enforcement edge cases** — Changing the last Owner's role to Staff or revoking an Owner was tested by unit tests, but not via the API or UI.
5. **Invite acceptance email mismatch** — The `INVITATION_EMAIL_MISMATCH` code path was not manually triggered.
6. **Dogra API key vs. service account** — The code supports both, but only the service-account path (`DOGRAH_SERVICE_EMAIL` + `DOGRAH_SERVICE_PASSWORD`) is configured by default.
7. **Production environment checks** — `env.ts` has a `production` refinement block that was not run with `NODE_ENV=production`.
8. **`bun.lockb` validity** — The local machine ran `bun install` with Bun 1.3.0. The lockfile is for Bun 1.1.45; a 1.1.45 run should be re-confirmed.

## Known gaps in the documentation

- Some `app/web/src/routes/*.tsx` references use the start line of the component function rather than the specific handler. If the route files change, these line numbers will drift.
- The `.env.example` file is verbose but not every variable is strictly required by `env.ts`; a separate "minimal local `.env`" checklist would be useful.
- The Dograh submodule has its own README, `.env.example`, and configuration; this documentation does not repeat it.
- The `design-system` route is a component gallery; not every component's prop combinations are documented.

## Suggested next steps for a new contributor

1. Run the full stack with `./scripts/start.sh` and create a workspace through the UI.
2. Publish a widget and test the browser call on `http://localhost:3000`.
3. Upload a real PDF to the knowledge manager and verify the worker processes it.
4. Invite a second user with a different email and accept the invitation.
5. Run the API with `NODE_ENV=production` and a real Resend key to verify production environment validation.
6. Add a smoke test in `app/api/tests` that hits `/api/health` and `/api/dograh/status` against the running Docker stack.

