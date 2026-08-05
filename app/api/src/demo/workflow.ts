import {
  buildTenantWorkflow,
  tenantWorkflowConfigurations,
  tenantWorkflowName,
  type TenantBusinessProfile,
} from "../dograh/config";
import { type TenantAgentSettings } from "../dograh/types";
import { dograh } from "../dograh/client";
import { env } from "../env";
import { getVertical } from "../verticals";

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

function escapeVoiceName(voice?: string | null): string {
  if (!voice) return "default";
  return voice
    .trim()
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .replace(/^[0-9-]+/, "")
    .slice(0, 40)
    .toLowerCase();
}

function capitalizeVoice(voice: string): string {
  return voice.charAt(0).toUpperCase() + voice.slice(1);
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
  const rawVoice = escapeVoiceName(input.voice);
  const voiceLabel = rawVoice ? capitalizeVoice(rawVoice) : "default";
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
    voice: voiceLabel,
    allowInterrupt: true,
    escalationGuidance:
      "If the caller says they want to speak to a human, the question is complex, or they are upset, politely offer to take a message and have the team follow up.",
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

  const workflowDefinition = buildTenantWorkflow(business, settings, []);
  const workflowConfigurations = {
    ...tenantWorkflowConfigurations(settings),
    max_call_duration: 60,
    max_user_idle_timeout: 15,
  };

  const workflowName = tenantWorkflowName(business, settings);

  const created = await dograh.createWorkflow(workflowName, workflowDefinition);
  await dograh.updateWorkflow(
    created.id,
    workflowName,
    workflowDefinition,
    workflowConfigurations,
  );
  await dograh.publishWorkflow(created.id);

  const token = await dograh.createEmbedToken(created.id, {
    embedMode: "headless",
    autoStart: false,
  });

  const scriptUrl =
    `${env.dograhWidgetUrl}/embed/dograh-widget.js` +
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
