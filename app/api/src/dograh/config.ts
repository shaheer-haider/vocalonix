import { createHash } from "node:crypto";

import type { TenantAgentSettings } from "./types";

export const TENANT_CONFIG_VERSION = 1;

export interface TenantBusinessProfile {
  id: string;
  name: string;
  city: string | null;
  country: string;
  timezone: string;
  vertical: string | null;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
}

export function stableConfigurationHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

export function tenantWorkflowName(
  business: TenantBusinessProfile,
  settings: TenantAgentSettings,
): string {
  return `[Vocalonix:${business.id}] ${settings.agentName} for ${business.name}`;
}

function hoursContext(settings: TenantAgentSettings): string {
  const rows = Object.entries(settings.businessHours)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([day, hours]) =>
      hours.enabled ? `${day}: ${hours.open}-${hours.close}` : `${day}: closed`,
    );
  return rows.length ? rows.join("; ") : "Business hours have not been configured.";
}

export function buildTenantWorkflow(
  business: TenantBusinessProfile,
  settings: TenantAgentSettings,
  documentUuids: string[],
): Record<string, unknown> {
  const globalPrompt = [
    `You are ${settings.agentName}, the browser-based voice agent for ${business.name}.`,
    `Use a ${settings.tone} tone and a ${settings.voice} speaking style.`,
    `Business location: ${[business.city, business.country].filter(Boolean).join(", ")}.`,
    business.vertical
      ? `Business type: ${business.vertical}.`
      : "Business type has not been configured.",
    `Business timezone: ${business.timezone}.`,
    `Business hours for context only: ${hoursContext(settings)}`,
    "You may answer only from saved business context and attached knowledge.",
    settings.escalationGuidance,
    "Never claim booking, live availability, SMS, payments, phone routing, or other tools.",
    "If the answer is not supported by context, say a team member can follow up.",
  ].join("\n");

  return {
    nodes: [
      {
        id: "vocalonix-global",
        type: "globalNode",
        position: { x: -320, y: 420 },
        data: {
          name: "Business context and guardrails",
          prompt: globalPrompt,
          allow_interrupt: settings.allowInterrupt,
        },
      },
      {
        id: "vocalonix-start",
        type: "startCall",
        position: { x: 100, y: 60 },
        data: {
          name: "Greeting",
          prompt: "Greet the visitor, then listen for how you can help.",
          greeting_type: "text",
          greeting: settings.greeting,
          allow_interrupt: settings.allowInterrupt,
          add_global_prompt: true,
          delayed_start: false,
          is_start: true,
          extraction_enabled: false,
          pre_call_fetch_enabled: false,
          document_uuids: documentUuids,
        },
      },
      {
        id: "vocalonix-agent",
        type: "agentNode",
        position: { x: 520, y: 420 },
        data: {
          name: "Conversation",
          prompt: settings.prompt,
          allow_interrupt: settings.allowInterrupt,
          add_global_prompt: true,
          extraction_enabled: false,
          extraction_prompt: "",
          extraction_variables: [],
          document_uuids: documentUuids,
        },
      },
      {
        id: "vocalonix-end",
        type: "endCall",
        position: { x: 100, y: 800 },
        data: {
          name: "Closing",
          prompt: settings.closing,
          allow_interrupt: false,
          add_global_prompt: true,
          is_end: true,
          extraction_enabled: false,
        },
      },
    ],
    edges: [
      {
        id: "vocalonix-start-agent",
        type: "custom",
        source: "vocalonix-start",
        target: "vocalonix-agent",
        animated: true,
        data: {
          label: "Continue",
          condition: "The visitor has responded or explained what they need.",
        },
      },
      {
        id: "vocalonix-start-end",
        type: "custom",
        source: "vocalonix-start",
        target: "vocalonix-end",
        animated: true,
        data: {
          label: "End",
          condition: "The visitor wants to stop or the request is unrelated.",
        },
      },
      {
        id: "vocalonix-agent-end",
        type: "custom",
        source: "vocalonix-agent",
        target: "vocalonix-end",
        animated: true,
        data: {
          label: "Finish",
          condition: "The request is complete and the visitor has nothing else to discuss.",
        },
      },
    ],
    viewport: { x: 0, y: 0, zoom: 0.8 },
    metadata: {
      managed_by: "vocalonix",
      vocalonix: {
        schema_version: TENANT_CONFIG_VERSION,
        business_id: business.id,
      },
    },
  };
}

export function tenantWorkflowConfigurations(
  settings: TenantAgentSettings,
): Record<string, unknown> {
  return {
    max_call_duration: 600,
    max_user_idle_timeout: 20,
    smart_turn_stop_secs: 2,
    turn_start_strategy: settings.allowInterrupt ? "default" : "min_words",
    turn_start_min_words: settings.allowInterrupt ? 3 : 100,
    turn_stop_strategy: "transcription",
    context_compaction_enabled: false,
  };
}

export function tenantDesiredConfiguration(input: {
  business: TenantBusinessProfile;
  settings: TenantAgentSettings;
  documentUuids: string[];
}): {
  hash: string;
  name: string;
  workflowDefinition: Record<string, unknown>;
  workflowConfigurations: Record<string, unknown>;
} {
  const documentUuids = [...input.documentUuids].sort();
  const workflowDefinition = buildTenantWorkflow(
    input.business,
    input.settings,
    documentUuids,
  );
  const workflowConfigurations = tenantWorkflowConfigurations(input.settings);
  const name = tenantWorkflowName(input.business, input.settings);
  return {
    hash: stableConfigurationHash({
      version: TENANT_CONFIG_VERSION,
      name,
      workflowDefinition,
      workflowConfigurations,
    }),
    name,
    workflowDefinition,
    workflowConfigurations,
  };
}
