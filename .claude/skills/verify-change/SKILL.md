---
name: verify-change
description: Prove a Harkbell change actually works before claiming it does. Use before finishing any task that touched an API route, the worker, the Dograh engine, or a user-facing page — and whenever asked to test, verify, check, or walk through the app. Covers bringing up the Compose stack, confirming you are testing your own build, the end-to-end walkthrough, and what to write in the PR.
---

# Verifying a change

`bun run test` passing is **not** evidence that a route works. All 147 tests are
unit tests; not one exercises an HTTP route. That gap already let a bought phone
number reach production able to bill monthly and unable to ring.

So the standard is: say what you actually ran, and name what you could not.

## Static checks first

```bash
bun run typecheck    # both workspaces
bun run test         # app/api
```

Both must be clean before anything else is worth doing.

## Bring up the stack

```bash
./scripts/setup.sh                       # first time only; never overwrites values
docker compose up -d --build --wait
docker compose ps                        # every service healthy
curl -fsS http://localhost:3001/api/health
curl -fsS http://localhost:3001/api/dograh/health   # turnEnabled: true for calls
```

Do **not** start dev servers with `Bash`. Use Compose, or the Browser pane's
`preview_start` for a frontend-only loop.

### Confirm you are testing your own code

Compose images go stale while containers still report healthy. Before trusting
anything you see:

```bash
curl -sS http://localhost:3000/ | grep -o 'assets/index-[^"]*\.js'
curl -sS "http://localhost:3000/assets/index-XXXX.js" | grep -c 'a string only your change introduces'
```

Zero matches means you are looking at the old build:

```bash
docker compose up -d --build --wait harkbell-api vocalonix-web vocalonix-worker
```

then hard-reload to bust the cached `index.html`.

The API defaults `APP_ORIGIN` to `http://localhost:3000`. A preview on another
port gives `Failed to fetch` in the browser while `/api/health` looks perfectly
healthy — prefer the Compose web service.

## Verify by what changed

| Changed | Do this |
|---|---|
| API route | Real requests for all four paths: unauthenticated → 401, non-member → 404, wrong role → 403, valid → 200 |
| Schema | `docker compose down -v` then up, so migrations run against an empty database |
| Workflow / prompts / tools | Inspect the graph on the Dograh dashboard (`:3010`), then **place a real call** |
| Voice stack | `GET /api/platform/status`, then a real call |
| Telephony | attach → duplicate-claim refusal → re-route → release → re-claim |
| Billing | Stripe test mode: Checkout, webhook delivery, plan reflected in `GET /api/b/:slug/billing` |
| Frontend | Browser pane: console clean, network 2xx, keyboard reachable, ~420px and desktop |
| Worker | Restart it mid-queue and confirm the work still completes |

## The full walkthrough

For a release, or any change touching onboarding, publishing or calling.

1. **`/`** — loads as the public landing page. The **Hear it now** CTA appears
   in nav, hero and footer, points at `/demo`, and all three hide when
   `turnEnabled` is false.
2. **`/demo`** — live vertical (coming-soon ones disabled) → business basics →
   intake → voice (selecting one must not stop a playing preview) → the 60s
   timer and caller scripts visible before connecting → call → feedback. Score
   4–5 redirects to `/signup` carrying `demoEmail`, `demoName` and a `redirect`
   with `demoBusiness`, `demoCity`, `demoVertical`.
3. **`/signup`** — name and email pre-filled; use the preview verification link.
4. **`/app/onboarding/create`** — business name, city and vertical pre-filled;
   **contact email must not be**.
5. **Onboarding** — no side nav; Harkbell wordmark, **Exit setup** to `/app`,
   clickable completed steps. Profile → agent → knowledge → widget → review →
   publish. Afterwards: a **Published** pill, **Go to dashboard**, and a small
   **Republish** ghost button.
6. **Dashboard** — side nav visible, business name in the switcher, no topbar.
   On a phone: Today, Diary, Callbacks, Calls, plus **More**.
7. **Embed snippet** — wrapped code block with a Copy button, and **no
   horizontal page scroll** at ~420px *or* desktop. Assert it rather than
   eyeballing:
   `document.documentElement.scrollWidth <= document.documentElement.clientWidth`
8. **Widget on a third-party origin** — serve the snippet from another port and
   check the launcher, panel, host-theme matching, mobile sheet, and the
   microphone-denied path.

## When something does not work

In order, because the answer is usually early:

1. `GET /api/platform/status` — names the failing subsystem and the env var.
2. Is the **worker** running? No worker means nothing ever publishes.
3. `GET /api/b/:slug/dograh` — sync state and last error for that business.
4. `outbox_events` — anything `failed`, or `pending` with a high
   `attempt_count`.
5. The graph on the Dograh dashboard.
6. `docker compose logs -f harkbell-api vocalonix-worker api`.

## Report honestly

In the PR, write what you ran:

> Compose stack rebuilt from this branch (bundle `index-B7xK2p.js`). Placed a
> browser call end to end; the agent booked into the diary and the booking
> appeared with `source: agent`. Checked 401/404/403/200 on the new route.
> `bun run test` green, typecheck clean.
> **Not verified:** inbound PSTN — no Telnyx key in this environment.

Naming the gap is what makes the rest believable. Never write "tests pass" as
though it covered a route.
