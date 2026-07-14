import { env } from "../env";
import { dograh } from "./client";
import type { AgentSettings, DograhDocument, DograhWorkflow } from "./types";

const WORKFLOW_PREFIX = "[Vocalonix]";

export const defaultAgentSettings: AgentSettings = {
  agentName: "Nova",
  businessName: "Your Business",
  greeting: "Hi, thanks for calling. I am Nova. How can I help you today?",
  prompt:
    "Answer questions clearly and conversationally. Use the attached knowledge base when relevant. If you do not know an answer, say that a team member will follow up instead of guessing.",
  closing: "Thanks for calling. Have a great day.",
  allowInterrupt: true,
  widgetButtonText: "Talk to us",
  widgetColor: "#5b5bd6",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function readSettings(workflow: DograhWorkflow): AgentSettings {
  const definition = workflow.workflow_definition;
  const metadata = isRecord(definition.metadata) ? definition.metadata : {};
  const vocalonix = isRecord(metadata.vocalonix) ? metadata.vocalonix : {};
  const settings = isRecord(vocalonix.settings) ? vocalonix.settings : {};

  return {
    agentName: stringValue(settings.agentName, defaultAgentSettings.agentName),
    businessName: stringValue(settings.businessName, defaultAgentSettings.businessName),
    greeting: stringValue(settings.greeting, defaultAgentSettings.greeting),
    prompt: stringValue(settings.prompt, defaultAgentSettings.prompt),
    closing: stringValue(settings.closing, defaultAgentSettings.closing),
    allowInterrupt: booleanValue(settings.allowInterrupt, defaultAgentSettings.allowInterrupt),
    widgetButtonText: stringValue(settings.widgetButtonText, defaultAgentSettings.widgetButtonText),
    widgetColor: stringValue(settings.widgetColor, defaultAgentSettings.widgetColor),
  };
}

function attachedDocuments(workflow: DograhWorkflow): string[] {
  const nodes = Array.isArray(workflow.workflow_definition.nodes)
    ? workflow.workflow_definition.nodes
    : [];
  const agent = nodes.find(
    (node) => isRecord(node) && node.type === "agentNode" && isRecord(node.data),
  );
  if (!isRecord(agent) || !isRecord(agent.data) || !Array.isArray(agent.data.document_uuids)) {
    return [];
  }
  return agent.data.document_uuids.filter((value): value is string => typeof value === "string");
}

function workflowName(settings: AgentSettings): string {
  return `${WORKFLOW_PREFIX} ${settings.agentName || env.dograhWorkflowName}`;
}

export function buildWorkflow(
  settings: AgentSettings,
  documentUuids: string[],
): Record<string, unknown> {
  const globalPrompt = [
    `You are ${settings.agentName}, the voice agent for ${settings.businessName}.`,
    "Keep answers concise, natural, and suitable for text-to-speech.",
    "Never invent business-specific information.",
  ].join("\n");

  return {
    nodes: [
      {
        id: "vocalonix-global",
        type: "globalNode",
        position: { x: -320, y: 420 },
        data: {
          name: "Agent identity",
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
          prompt: `Open with this greeting and then listen: "${settings.greeting}"`,
          greeting_type: "text",
          allow_interrupt: settings.allowInterrupt,
          add_global_prompt: true,
          delayed_start: false,
          is_start: true,
          extraction_enabled: false,
          pre_call_fetch_enabled: false,
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
          prompt: `End the call with this closing: "${settings.closing}"`,
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
          condition: "The caller has responded to the greeting or explained why they are calling.",
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
          condition: "The caller wants to stop, reached a wrong number, or is spam.",
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
          condition: "The request is complete and the caller has nothing else to discuss.",
        },
      },
    ],
    viewport: { x: 0, y: 0, zoom: 0.8 },
    metadata: {
      managed_by: "vocalonix",
      vocalonix: {
        schema_version: 1,
        settings,
      },
    },
  };
}

async function completedDocumentUuids(): Promise<string[]> {
  const response = await dograh.listDocuments();
  return response.documents
    .filter((document) => document.processing_status === "completed")
    .map((document) => document.document_uuid)
    .sort();
}

export async function ensureWorkflow(): Promise<DograhWorkflow> {
  const workflows = await dograh.listWorkflows();
  const managed = workflows.find((workflow) => workflow.name.startsWith(WORKFLOW_PREFIX));
  if (managed) return dograh.getWorkflow(managed.id);

  const documents = await completedDocumentUuids();
  return dograh.createWorkflow(
    workflowName(defaultAgentSettings),
    buildWorkflow(defaultAgentSettings, documents),
  );
}

export async function saveSettings(settings: AgentSettings): Promise<DograhWorkflow> {
  const workflow = await ensureWorkflow();
  const documents = await completedDocumentUuids();
  await dograh.updateWorkflow(workflow.id, workflowName(settings), buildWorkflow(settings, documents));
  await dograh.publishWorkflow(workflow.id);
  return dograh.getWorkflow(workflow.id);
}

export async function syncCompletedDocuments(
  documents: DograhDocument[],
): Promise<DograhWorkflow> {
  const workflow = await ensureWorkflow();
  const desired = documents
    .filter((document) => document.processing_status === "completed")
    .map((document) => document.document_uuid)
    .sort();
  const current = attachedDocuments(workflow).sort();

  if (JSON.stringify(current) === JSON.stringify(desired)) return workflow;

  const settings = readSettings(workflow);
  await dograh.updateWorkflow(workflow.id, workflowName(settings), buildWorkflow(settings, desired));
  await dograh.publishWorkflow(workflow.id);
  return dograh.getWorkflow(workflow.id);
}
