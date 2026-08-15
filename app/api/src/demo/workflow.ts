import { tenantDesiredConfiguration, type TenantBusinessProfile } from "../dograh/config";
import { type TenantAgentSettings } from "../dograh/types";
import { dograh } from "../dograh/client";
import { env } from "../env";
import { businessVoiceOverride } from "../platform/providers";
import { getVertical } from "../verticals";
import { DEFAULT_VOICE_ID, resolveVoice } from "../voices";

export interface DemoWorkflowInput {
  sessionId: string;
  businessName: string;
  city?: string | null;
  country?: string;
  timezone?: string;
  vertical: string;
  services: string[];
  verticalAnswers: Record<string, unknown>;
  voice?: string | null;
  agentName?: string;
}

export interface DemoWorkflowResult {
  workflowId: number;
  workflowUuid: string | null;
  embedToken: string;
  scriptUrl: string;
}

function buildDemoPrompt(input: DemoWorkflowInput): string {
  const vertical = getVertical(input.vertical);
  const location = [input.city, input.country].filter(Boolean).join(", ") || "Not provided";

  const services = input.services.length
    ? input.services.join(", ")
    : (vertical?.defaultServices?.join(", ") ?? "general appointments");

  const answerLines = Object.entries(input.verticalAnswers)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => {
      const label = key.replace(/_/g, " ");
      return `- ${label}: ${Array.isArray(value) ? value.join(", ") : value}`;
    });

  const verticalContext = answerLines.length
    ? `\n\nExtra context about this business:\n${answerLines.join("\n")}`
    : "";

  const base = vertical?.systemPromptTemplate ??
    `You are {agentName}, the AI receptionist for {business_name}, a {vertical} business.
Use a {tone} tone and a {voice} speaking style.
Services offered: {services}.
Business location: {location}.
Answer questions honestly. If you do not know something, say a team member can follow up.
Do not claim booking, live availability, SMS, payments, phone routing, or other tools.`;

  return base
    .replaceAll("{agentName}", input.agentName ?? "Ava")
    .replaceAll("{business_name}", input.businessName)
    .replaceAll("{vertical}", input.vertical)
    .replaceAll("{services}", services)
    .replaceAll("{location}", location)
    .replaceAll("{vertical_context}", verticalContext);
}

export function buildDemoAgentSettings(input: DemoWorkflowInput): TenantAgentSettings {
  const vertical = getVertical(input.vertical);
  const tone = vertical?.tone ?? "warm";
  const agentName = input.agentName?.trim() || "Ava";

  const businessName = input.businessName.trim();

  const greeting = (vertical?.defaultGreeting ?? "Hi, thanks for calling {business_name}, this is {agentName} — how can I help you?")
    .replaceAll("{business_name}", businessName)
    .replaceAll("{agentName}", agentName);

  return {
    agentName,
    greeting,
    prompt: buildDemoPrompt(input),
    closing: "Thanks for trying Vocalonix. If you'd like this answering your website too, just sign up and we can publish it in a few minutes.",
    tone,
    voice: resolveVoice(input.voice).id,
    allowInterrupt: true,
    escalationGuidance:
      "This is a one-minute demo of what the agent sounds like, not the business's real line. Never promise a callback or a booking.",
    transferPhone: "",
    businessHours: {},
    widgetButtonText: "Speak with us",
    widgetColor: "#4f46e5",
    allowedDomains: [],
  };
}

export function buildDemoBusinessProfile(input: DemoWorkflowInput): TenantBusinessProfile {
  return {
    id: input.sessionId,
    name: input.businessName.trim(),
    city: input.city ?? null,
    country: (input.country || "US").trim(),
    timezone: (input.timezone || "America/New_York").trim(),
    vertical: input.vertical,
  };
}

export async function provisionDemoWorkflow(
  input: DemoWorkflowInput,
): Promise<DemoWorkflowResult> {
  const business = buildDemoBusinessProfile(input);
  const settings = buildDemoAgentSettings(input);

  const voiceId = resolveVoice(input.voice).id;
  const desired = tenantDesiredConfiguration({
    business,
    settings,
    documentUuids: [],
    // A demo agent has no diary, no callback queue and no phone leg behind it,
    // so it must not offer any of them.
    capabilities: { telephony: false, transfer: false, takeMessage: false },
    voiceOverride: voiceId === DEFAULT_VOICE_ID ? null : businessVoiceOverride(voiceId),
  });
  const workflowConfigurations = {
    ...desired.workflowConfigurations,
    max_call_duration: 60,
    max_user_idle_timeout: 15,
  };

  const created = await dograh.createWorkflow(
    desired.name,
    desired.workflowDefinition,
  );
  await dograh.updateWorkflow(
    created.id,
    desired.name,
    desired.workflowDefinition,
    workflowConfigurations,
  );
  await dograh.publishWorkflow(created.id);

  const token = await dograh.createEmbedToken(created.id, {
    embedMode: "headless",
    autoStart: false,
    agentName: settings.agentName,
    businessName: business.name,
  });

  const scriptUrl =
    `${env.dograhWidgetUrl}/embed/vocalonix-widget.js` +
    `?token=${encodeURIComponent(token.token)}` +
    `&environment=local` +
    `&apiEndpoint=${encodeURIComponent(env.dograhPublicApiUrl)}`;

  return {
    workflowId: created.id,
    workflowUuid: created.workflow_uuid ?? null,
    embedToken: token.token,
    scriptUrl,
  };
}
