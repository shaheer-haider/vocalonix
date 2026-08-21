# Harkbell

A multi-tenant AI receptionist for small service businesses. A business signs
up, configures its agent, and publishes. That agent then answers on the
business's own website through an embeddable widget and, once a number is
connected, on the phone — booking into the real diary, taking messages, and
handing over to a person when it should.

Voice orchestration runs on a self-hosted [Dograh](https://github.com/dograh-hq/dograh)
instance, vendored as a git submodule. Harkbell generates and owns each tenant's
workflow on that engine; the browser never receives Dograh credentials.

> **Formerly Vocalonix.** Renamed before any public release — no users, no
> announcement under the old name. Everything a customer sees says Harkbell.
> Infrastructure identifiers (this repository, container and image names, the
> Postgres database and role, the widget global, the agent-tools header) still
> read `vocalonix` deliberately: renaming them is an outage risk with no
> user-visible benefit.

## Quick start

Requirements: Git, Docker, Docker Compose v2. Bun 1.1.45 for the app-only mode.

```bash
git clone --recurse-submodules https://github.com/shaheer-haider/vocalonix.git
cd vocalonix
./scripts/setup.sh
docker compose up -d --build --wait
```

| | |
|---|---|
| Web app | http://localhost:3000 |
| API health | http://localhost:3001/api/health |
| Dograh engine | http://localhost:8000 |
| Dograh dashboard | http://localhost:3010 |

First boot pulls the Dograh images and takes a few minutes. `setup.sh` generates
every local secret; provider keys stay empty for you to fill in.

To make real calls work, put at least one speech key in `.env` and restart the
API — the dashboard's **Setup** panel reports what was accepted and names the
variable that fixes each gap.

| What you want | What to set |
|---|---|
| Calls working at all | `GEMINI_API_KEY` |
| Calls working *well* | `DEEPGRAM_API_KEY` + `OPENAI_API_KEY` |
| A real phone number | `TELNYX_API_KEY` |
| Real sign-in emails | `RESEND_API_KEY` + a verified sending domain |

Stop with `docker compose down`.

### App only

When Dograh is already running somewhere:

```bash
bun install
./scripts/dev-app.sh
```

## Layout

```
app/api/     Bun + Elysia + Drizzle + better-auth. The only component that
             holds Dograh credentials.
app/web/     React 19 + Vite + TanStack Router. Static SPA.
dograh/      Dograh v1.41.0 submodule. Not modified here.
scripts/     setup.sh, start.sh, dev-app.sh
deploy/      Hetzner production compose, Caddy, runbook
terraform/   OpenTofu infrastructure
docs/        Technical documentation
```

## Checks

```bash
bun install --frozen-lockfile && bun run typecheck && bun run test
```

## Documentation

| | |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | The working agreement — read first, human or agent |
| [`docs/`](docs/README.md) | Architecture, data model, API reference, frontend, voice engine, operations, testing |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | The engineering standard |
| [`STATUS.md`](STATUS.md) | What is built, what is not, what is next |
| [`deploy/hetzner/README.md`](deploy/hetzner/README.md) | Deploy and key rotation |
