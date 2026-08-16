# Harkbell documentation

Written from the source, not from file names or intentions. Where the code and
a document disagree, the code wins and the document is a bug — fix it in the
same change.

Start with [`../CLAUDE.md`](../CLAUDE.md), which is the short version and the
working agreement. These files are the depth behind it.

## Reading order

| # | Document | What it answers |
|---|---|---|
| 01 | [Overview](01-overview.md) | What the product is, its domain language, and what a business gets |
| 02 | [Setup](02-setup.md) | Getting it running, both modes, and what each key unlocks |
| 03 | [Architecture](03-architecture.md) | Processes, trust boundaries, the outbox, request lifecycle |
| 04 | [Data model](04-data-model.md) | Every table, why it exists, and the constraints that matter |
| 05 | [API reference](05-api-reference.md) | Every endpoint, its auth, and its permission |
| 06 | [Frontend](06-frontend.md) | Routes, shells, data fetching, styling, the widget |
| 07 | [Voice engine](07-voice-engine.md) | Dograh, the sync engine, workflow generation, tools, voices, telephony |
| 08 | [Operations](08-operations.md) | Environment, deploy, monitoring, incident runbook |
| 09 | [Testing](09-testing.md) | What is covered, what is not, and how to verify a change for real |
| 10 | [Conventions](10-conventions.md) | Glossary and the house style |

Adjacent, outside this folder:

- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — the engineering standard: definition
  of done, review rules, release discipline.
- [`../STATUS.md`](../STATUS.md) — what is built, what is not, what is next.
  The one document that is allowed to talk about the future.
- [`../deploy/hetzner/README.md`](../deploy/hetzner/README.md) — deploy and
  key-rotation commands for the production servers.

## Archive

[`archive/`](archive/README.md) holds dated point-in-time records — the original
launch plan, the August codebase audit, and two end-to-end test reports. They are
**history, not reference**, and several describe things that no longer exist. Do
not update them; write a new one if you need one.

[`design/`](design/) holds the UI revamp guide and a design export. Design
intent, not implementation truth.
