# Testing

```bash
bun run typecheck    # both workspaces, tsc --noEmit
bun run test         # app/api, bun test
bun run build        # vite build for web; tsc --noEmit for api
```

CI (`.github/workflows/ci.yml`) runs exactly that, plus `db:migrate` against a
real Postgres 16 service, on every pull request and every push to `main`.

## What is covered today

147 tests across 17 files. All green. **All of them are unit tests.**

| File | Tests | Covers |
|---|---:|---|
| `dograh/ingest.test.ts` | 20 | Caller extraction, sanitising, gap normalisation, run duration |
| `platform/telnyx.test.ts` | 19 | Carrier API request shaping and error handling |
| `dograh/config.test.ts` | 16 | Workflow generation, node/edge shape, hash stability |
| `billing/billing.test.ts` | 15 | Plan resolution, entitlement, webhook signature, usage window |
| `platform/telephony.test.ts` | 13 | E.164, dialability, pool derivation |
| `agent/slots.test.ts` | 12 | Timezone maths, open slots, clash detection |
| `auth/password.test.ts` | 8 | Password rules and reset flow helpers |
| `platform/voiceStack.test.ts` | 7 | Stack resolution from key combinations |
| `dograh/extract.test.ts` | 6 | Transcript parsing, caller-turn detection |
| `voices.test.ts` | 5 | Catalogue, per-provider mapping |
| `workspace/permissions.test.ts` | 5 | The role matrix and `canManageRole` |
| `outbox.test.ts` | 4 | Retry backoff, poll-reschedule, failure updates |
| `rateLimit.test.ts` | 4 | Window behaviour |
| `uploads.test.ts` | 4 | Extension allow-list, magic-byte sniffing |
| `dograh/errors.test.ts` | 3 | Failure classification |
| `dograh/tenant.test.ts` | 3 | `synchronizationDecision` |
| `pagination.test.ts` | 3 | `parseListQuery` |

## What is not covered

**Not one test exercises an HTTP route.** No test constructs a request, no test
asserts a status code, no test verifies that a workspace route rejects a
non-member.

This is the single largest quality gap in the repository, and it is not
theoretical. A phone number reached production able to bill monthly and unable
to receive a call: every unit passed, the typecheck was clean, and the deploy
succeeded. Nothing tested the path the units formed.

Also uncovered:

- The multi-tenancy boundary. Nothing proves `requireWorkspace` rejects a
  non-member — the thing whose failure would be worst.
- Every permission check, as applied to an actual route.
- The outbox end to end: enqueue → claim → handle → complete.
- Auth: signup, login, magic link, session lifecycle.
- The frontend. There are no web tests at all.

## Adding tests

`bun:test`, colocated as `*.test.ts` next to the code.

The suite is fast and deterministic because it tests **pure functions**. That
shape is worth preserving: extract the decision, the maths or the parsing into a
function that takes data and returns data, then test that. `synchronizationDecision`,
`resolveVoiceStack`, `failureUpdate`, `computeOpenSlots`, `derivePool` all exist
in that shape for this reason.

Where a collaborator is unavoidable, inject it. `synchronizeBusiness` takes an
optional `client?: DograhManagementClient`, which is how `tenant.test.ts` runs
without an engine. Prefer that over module mocking.

### If you write the first route test

You would be doing the most valuable thing available. Elysia apps are callable:

```ts
const response = await app.handle(
  new Request("http://localhost/api/b/acme/bookings", {
    headers: { cookie: `vocalonix_session=${token}` },
  }),
);
expect(response.status).toBe(404);   // non-member must not see it exists
```

Start with the boundary, not the happy path: a non-member gets 404, a Viewer
gets 403 on a mutation, an unauthenticated request gets 401. Those three
assertions across the workspace routes would cover the risk that matters most.

## Manual verification

Until route tests exist, **the Compose stack is the test suite** for anything
touching a route, the worker, or the engine. "Typecheck passes" is not evidence
that a route works, and saying so in a PR is not acceptable.

```bash
./scripts/setup.sh
docker compose up -d --build --wait
docker compose ps                       # every service healthy
curl -fsS http://localhost:3001/api/health
curl -fsS http://localhost:3001/api/dograh/health   # turnEnabled: true for calls
```

### Check you are testing your own code

Compose images go stale while containers still report healthy. Before trusting a
browser pass, confirm the served bundle contains something unique to your change:

```bash
curl -sS http://localhost:3000/ | grep -o 'assets/index-[^"]*\.js'
curl -sS "http://localhost:3000/assets/index-XXXX.js" | grep -c 'a string only your change introduces'
```

If it is missing:

```bash
docker compose up -d --build --wait vocalonix-api vocalonix-web vocalonix-worker
```

and hard-reload the browser to bust the cached `index.html`.

The API defaults `APP_ORIGIN` to `http://localhost:3000`. A frontend preview on
another port produces `Failed to fetch` in the browser while `/api/health` looks
perfectly healthy. Prefer the Compose web service.

## The full walkthrough

Run this before a release, and after any change that touches onboarding,
publishing or calling.

**1. Landing** — `/` loads as the public page. The **Hear it now** CTA appears
three times (nav, hero, footer) and points at `/demo`. All three hide when
`/api/dograh/health` reports `turnEnabled: false`.

**2. Demo** (`/demo`) — pick a live vertical (coming-soon ones are disabled),
enter business basics, answer the intake, pick a voice (selecting one must not
stop an already-playing preview). The 60-second timer and the suggested caller
scripts are visible before connecting. Start the call, allow the microphone,
speak, end it. Score 4–5 redirects to `/signup` carrying `demoEmail`, `demoName`
and a `redirect` containing `demoBusiness`, `demoCity`, `demoVertical`; 1–3 goes
to a thanks page.

**3. Signup** — name and email pre-filled from the demo. Submit; with
verification on, use the preview link in the alert. Land on
`/app/onboarding/create` with the demo parameters intact.

**4. Create workspace** — `businessName`, `city` and `vertical` pre-filled;
**contact email must not be**. Country, timezone and locations default sensibly.

**5. Onboarding** — no workspace side nav; a Harkbell wordmark, an **Exit setup**
link to `/app`, and a stepper whose completed steps are clickable. Walk business
profile → agent (name, tone, voice, greeting, prompt, closing, escalation,
transfer number) → knowledge → widget (button text, accent, allowed domains) →
review. Publish. Afterwards: a **Published** pill, a **Go to dashboard**
primary button, and a small **Republish** ghost button.

**6. Dashboard** — side nav visible, business name in the workspace switcher, no
topbar. On a phone, the bottom nav shows Today, Diary, Callbacks and Calls, plus
**More** for the remaining seven.

**7. The embed snippet** — the code block must use `white-space: pre-wrap` and
must not cause horizontal page scroll. Check at ~420px **and** at desktop width:
`overflow-wrap: break-word` does not clamp intrinsic min-content width, so a long
unbreakable token can widen the whole page even though the `<pre>` reports no
internal overflow. `.code-snippet pre` uses `overflow-wrap: anywhere` for this
reason. Whether it shows depends on the generated token, so it looks
intermittent — assert it rather than eyeballing it:

```js
document.documentElement.scrollWidth <= document.documentElement.clientWidth
```

**8. Widget on a third-party origin** — serve a page from another port (e.g.
`:8099`) with the generated snippet. Check the launcher, panel, suggested
prompts, host-theme matching, the mobile sheet layout, and the
microphone-denied error path.

## Per-change checklist

| Change | Verify |
|---|---|
| API route | The Compose stack, with a real request. Auth and permission boundaries too, not just the happy path |
| Schema | `db:generate` output committed; `db:migrate` clean against an empty database (`docker compose down -v`) |
| Workflow shape | `TENANT_CONFIG_VERSION` bumped; inspect the regenerated graph on the Dograh dashboard at `:3010` |
| Agent prompts / tools | Place a real call. There is no substitute |
| Voice stack | `/api/platform/status`, then a real call |
| Telephony | Attach → duplicate-claim refusal → re-route → release → re-claim |
| Billing | Stripe test mode: Checkout, webhook delivery, plan reflected in `GET /api/b/:slug/billing` |
| Frontend | Browser pane against the running stack: console clean, network 2xx, keyboard reachable, ~420px and desktop widths |
| Worker | Restart it mid-queue and confirm the work completes |

## Known gaps in past verification

The last full pass (2026-08-15) did **not** cover:

- a real spoken call — no provider keys were available in that environment, so
  everything up to the microphone prompt was exercised and the audio path was
  not;
- real inbound PSTN — the Telnyx path ran against a stubbed engine client;
- the email-verification branch of signup, which was off locally.
