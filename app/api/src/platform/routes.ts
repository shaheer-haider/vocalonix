import { Elysia } from "elysia";

import { dograh } from "../dograh/client";
import { env } from "../env";
import { requireSession } from "../workspace/context";
import { voiceCatalogue } from "../voices";
import { providerStatus, reconcileProviderConfiguration } from "./providers";
import { telephonyStatus } from "./telephony";

interface ReadinessCheck {
  id: string;
  label: string;
  state: "ready" | "attention" | "off";
  detail: string;
}

/**
 * One place that answers "can this platform actually take a call right now?".
 *
 * The operator's first question after pasting keys into `.env` is whether it
 * worked, and previously the only way to find out was to make a call and see.
 * Every check here reports what is wrong and the environment variable that
 * fixes it.
 */
async function readiness(): Promise<{
  callsReady: boolean;
  checks: ReadinessCheck[];
}> {
  const checks: ReadinessCheck[] = [];

  const engine = await dograh
    .health()
    .then((health) => ({ ok: true as const, health }))
    .catch(() => ({ ok: false as const, health: null }));
  checks.push({
    id: "engine",
    label: "Voice engine",
    state: engine.ok ? "ready" : "attention",
    detail: engine.ok
      ? "The voice engine is reachable."
      : "The voice engine is not reachable. Check DOGRAH_INTERNAL_URL and that the engine is running.",
  });

  const webrtc = Boolean(
    engine.health && (engine.health as Record<string, unknown>).turn_enabled,
  );
  checks.push({
    id: "webrtc",
    label: "Browser calls",
    state: webrtc ? "ready" : "attention",
    detail: webrtc
      ? "Browser callers can reach the agent through the widget."
      : "TURN is disabled, so browser calls will fail behind most networks. Set TURN_SECRET and restart the engine.",
  });

  const providers = await providerStatus();
  checks.push({
    id: "speech",
    label: "Speech and language models",
    state: providers.configured && !providers.lastError ? "ready" : "attention",
    detail: providers.lastError
      ? `The provider keys were rejected: ${providers.lastError}`
      : providers.configured
        ? `${providers.summary}.`
        : (providers.reason ?? "No speech provider keys are configured."),
  });

  const telephony = await telephonyStatus();
  checks.push({
    id: "telephony",
    label: "Phone numbers",
    state: telephony.configured ? (telephony.lastError ? "attention" : "ready") : "off",
    detail: telephony.lastError
      ? telephony.lastError
      : telephony.configured
        ? "Workspaces can connect a phone number to their agent."
        : (telephony.reason ??
          "Phone numbers are off. Browser calls still work without them."),
  });

  const emailReady = Boolean(env.resendApiKey);
  checks.push({
    id: "email",
    label: "Email delivery",
    state: emailReady ? "ready" : env.isProduction ? "attention" : "off",
    detail: emailReady
      ? `Sending from ${env.emailFrom}.`
      : "RESEND_API_KEY is not set, so sign-in links are only printed locally instead of being emailed.",
  });

  const insightsReady = Boolean(env.geminiApiKey || env.openaiApiKey);
  checks.push({
    id: "insights",
    label: "Call insights",
    state: insightsReady ? "ready" : "attention",
    detail: insightsReady
      ? "Transcripts are mined for contacts, callbacks and knowledge gaps."
      : "Neither GEMINI_API_KEY nor OPENAI_API_KEY is set, so transcripts are stored but not mined.",
  });

  return {
    callsReady:
      engine.ok && providers.configured && !providers.lastError,
    checks,
  };
}

export const platformRoutes = new Elysia()
  .get("/api/platform/voices", () => ({ voices: voiceCatalogue() }))
  .get("/api/platform/status", async ({ request }) => {
    await requireSession(request.headers);
    const [state, providers, telephony] = await Promise.all([
      readiness(),
      providerStatus(),
      telephonyStatus(),
    ]);
    return { ...state, providers, telephony };
  })
  .post("/api/platform/recheck", async ({ request }) => {
    await requireSession(request.headers);
    await reconcileProviderConfiguration({ force: true });
    const [state, providers, telephony] = await Promise.all([
      readiness(),
      providerStatus(),
      telephonyStatus(),
    ]);
    return { ...state, providers, telephony };
  });
