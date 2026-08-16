---
name: agent-workflow
description: Change what the Harkbell voice agent says or does. Use for work on app/api/src/dograh/** (workflow generation, prompts, agent tools, sync), app/api/src/platform/** (voice stack, providers, telephony), verticals.ts or voices.ts. Covers TENANT_CONFIG_VERSION, the sync state machine, tool registration, and why a change can silently reach new tenants only.
---

# Changing the agent

The single rule that catches everyone:

> **If the shape of a generated workflow changes, bump `TENANT_CONFIG_VERSION`
> in `app/api/src/dograh/config.ts`.**

It is part of the config hash. `synchronizationDecision()` no-ops when the hash
matches what the engine last accepted, so without a bump your change reaches
only businesses that happen to re-sync for some other reason. Every existing
tenant keeps the old graph, forever, and the difference is miserable to debug.

Bump it for: nodes, edges, tool wiring, prompt structure, extraction
configuration, anything in `buildTenantWorkflow`. Not for: a change that only
affects how a value is *read* from the database without altering the generated
output.

## Where things are

| Change | File |
|---|---|
| The graph — nodes, edges, routing conditions | `dograh/config.ts` → `buildTenantWorkflow` |
| What the agent is told | the `*NodePrompt` and `globalPrompt` functions in `config.ts` |
| Trade-specific rules and safety limits | `verticals.ts` → `VERTICAL_AGENT_RULES` |
| Tools the agent can call | `dograh/agent-tools.ts` (registration) + `agent/routes.ts` (serving) |
| Availability and booking maths | `agent/slots.ts` |
| The voice catalogue | `voices.ts` |
| Which speech providers are used | `platform/voiceStack.ts`, pushed by `platform/providers.ts` |
| Phone numbers and routing | `platform/telephony.ts`, `platform/telnyx.ts` |
| Sync state machine | `dograh/tenant.ts` |
| Pulling calls back out | `dograh/ingest.ts` |

**Never edit `dograh/`.** It is a pinned submodule. Read it — especially
`dograh/api/services/voice_prompting_guide/`, which is the style the prompts
here follow — but an upgrade is its own change with its own testing.

## The graph

Seven nodes, all `vocalonix-` prefixed:

```
global (context + guardrails)
start ──→ answer ──→ close
      ├─→ book ────→ handover ──→ message ──→ close
      └─→ end-early (spam, wrong number, silence)
```

Conditional pieces:

- The **booking** node exists only when the business has an active resource
  **and** an active agent-bookable service.
- The **transfer** tool attaches to handover only when the business has a live
  phone number **and** a transfer number — a warm transfer needs a PSTN leg.
- **Message** is always available. It is the universal fallback.

## Prompts

Follow the existing voice: short imperative sentences, `# Your job here` /
`# How this goes` sections, and explicit prohibitions rather than vague
encouragement. Never let the agent claim something the business has not said —
the global prompt exists to bound that.

Read `globalPrompt` before adding to it. It already carries live local time,
real opening hours, real services and prices, and the vertical rules.

## Tools

A tool's `description` carries its **firing rule**, not just what it does.
Dograh's guidance is that a model picking the wrong tool is usually a description
problem, not a prompt problem. Compare:

> Look up real open appointment slots for one service on one day. Call this
> before you say any time out loud, every time — never offer a slot you have not
> checked here.

Adding a tool means: a key in `AGENT_TOOL_KEYS`, a spec in `agentToolSpecs`, an
entry in the node's `nodeToolKeys`, and a handler in `agent/routes.ts` behind
`requireAgentKey`.

The tool URL is built from `VOCALONIX_INTERNAL_URL` and is **in the config
hash** — which is why moving the API automatically re-registers every agent.
That was a bug fix. Do not optimise it away.

## Voice stack

`resolveVoiceStack()` is pure and never throws. It reads `env`, decides what the
available keys can drive, and returns either a resolved stack or a failure with
a one-sentence reason for the readiness panel.

Pipeline (Deepgram STT → LLM → Deepgram TTS) is preferred whenever the keys
allow it: transcription on its own stream is what makes barge-in and knowledge
answers reliable. Realtime speech-to-speech only surfaces the caller's words
when the model chooses to.

Adding a provider means a branch in `pipelineTts`/`pipelineLlm`/`realtimeProvider`,
a mapping in `voices.ts` if it has voices, a case in `modelConfigurationPayload`,
and a test in `voiceStack.test.ts` for the key combination.

## Telephony

Buying a number is three operations — purchase, bind to the call-control
application, register the routing record on the engine — and a gap in any one
produces a number that bills monthly and never rings. All three are verified at
purchase and re-asserted at boot by `reconcileTelephonyConfiguration()`.

If you touch this, exercise the whole sequence: attach → duplicate-claim
refusal → re-route → release → re-claim.

## Verify

Unit tests cover generation and hashing (`config.test.ts`, `voiceStack.test.ts`,
`telephony.test.ts`), but they cannot tell you whether the agent behaves.

```bash
docker compose up -d --build --wait
```

1. Publish a business and open its workflow on the Dograh dashboard
   (`http://localhost:3010`). Confirm the nodes, edges and attached tools are
   what you intended.
2. `GET /api/b/:slug/dograh` — `syncState` should reach `synced`. A `rejected`
   state means the engine refused the configuration; read `lastError`.
3. **Place a real call.** For a prompt, tool or voice change there is no
   substitute. Use the suggested caller scripts from the vertical.
4. After the call, check the ingested result: a `call_records` row, a contact if
   the caller identified themselves, a callback if they left a message, a
   knowledge gap if the agent could not answer.

## Finish

- [ ] `TENANT_CONFIG_VERSION` bumped if the graph shape changed
- [ ] Existing businesses re-sync (confirm on a second, already-published one)
- [ ] Tool descriptions state when to fire, not just what they do
- [ ] `dograh/` submodule untouched
- [ ] A real call placed and its outcome described in the PR
- [ ] `docs/07-voice-engine.md` updated
