import { and, eq } from "drizzle-orm";

import { db } from "../db/client";
import { businessDograhMappings } from "../db/schema";
import { env } from "../env";
import type { DograhManagementClient } from "./client";
import { DograhError } from "./client";

/**
 * The tools a published agent can call mid-conversation.
 *
 * Each does exactly one thing, and its `description` carries the firing rule as
 * well as what it does — Dograh's guidance is that a model picking the wrong
 * tool is usually a description problem, not a prompt problem.
 */
export const AGENT_TOOL_KEYS = [
  "check_availability",
  "book_appointment",
  "take_message",
  "transfer_call",
] as const;

export type AgentToolKey = (typeof AGENT_TOOL_KEYS)[number];

export interface AgentToolSpec {
  key: AgentToolKey;
  body: Record<string, unknown>;
}

export interface AgentToolContext {
  businessId: string;
  /** Warm-transfer destination in E.164, or empty when transfers are off. */
  transferPhone: string;
}

function toolEndpoint(businessId: string, path: string): string {
  return `${env.harkbellInternalUrl}/api/agent-tools/${businessId}/${path}`;
}

function httpTool(
  key: AgentToolKey,
  businessId: string,
  path: string,
  name: string,
  description: string,
  parameters: Record<string, unknown>[],
): AgentToolSpec {
  return {
    key,
    body: {
      name,
      description,
      category: "http_api",
      icon: key === "take_message" ? "message-square" : "calendar",
      definition: {
        schema_version: 1,
        type: "http_api",
        config: {
          method: "POST",
          url: toolEndpoint(businessId, path),
          headers: { "x-vocalonix-agent-key": env.agentToolSecret },
          timeout_ms: 8000,
          parameters,
        },
      },
    },
  };
}

/** Specs for every tool this business's capabilities allow. */
export function agentToolSpecs(context: AgentToolContext): AgentToolSpec[] {
  const specs: AgentToolSpec[] = [
    httpTool(
      "check_availability",
      context.businessId,
      "availability",
      "Check booking availability",
      "Look up real open appointment slots for one service on one day. Call this before you say any time out loud, every time — never offer a slot you have not checked here. Returns the bookable services when the service name does not match one.",
      [
        {
          name: "service",
          type: "string",
          description:
            "The service the caller asked for, in their own words (for example: cut and blow dry, check-up, repair).",
          required: true,
        },
        {
          name: "date",
          type: "string",
          description:
            "The day to check as YYYY-MM-DD in the business's local timezone. Omit for today.",
          required: false,
        },
      ],
    ),
    httpTool(
      "book_appointment",
      context.businessId,
      "book",
      "Book appointment",
      "Put a real appointment in the diary. Call this only after the caller has confirmed all four of: the service, the day, the start time, and their name — and only for a time check_availability returned on this call. Returns a confirmation to read back, or the reason the slot could not be taken.",
      [
        {
          name: "service",
          type: "string",
          description: "The service to book, named as check availability returned it.",
          required: true,
        },
        {
          name: "date",
          type: "string",
          description: "The day as YYYY-MM-DD in the business's local timezone.",
          required: true,
        },
        {
          name: "time",
          type: "string",
          description:
            "The start time as 24-hour HH:MM in the business's local timezone, matching an open slot.",
          required: true,
        },
        {
          name: "customer_name",
          type: "string",
          description: "The caller's full name, exactly as they gave it.",
          required: true,
        },
        {
          name: "customer_phone",
          type: "string",
          description: "A phone number the caller gave for contact, if any.",
          required: false,
        },
      ],
    ),
    httpTool(
      "take_message",
      context.businessId,
      "message",
      "Take a message",
      "Record a message for the team and put the caller in the callback queue. Call this once you have the caller's name and the reason they called — a number as well whenever they will give one. Use it whenever you cannot help directly, whenever the caller asks for a person, and whenever something is urgent. Returns a confirmation to read back.",
      [
        {
          name: "customer_name",
          type: "string",
          description: "The caller's full name, exactly as they gave it.",
          required: true,
        },
        {
          name: "reason",
          type: "string",
          description:
            "One sentence on what the caller needs, in their own words rather than yours.",
          required: true,
        },
        {
          name: "customer_phone",
          type: "string",
          description:
            "The best number to call back on, read back to the caller and confirmed. Leave empty only if they refused to give one.",
          required: false,
        },
        {
          name: "customer_email",
          type: "string",
          description: "An email address, if the caller gave one instead of a number.",
          required: false,
        },
        {
          name: "urgent",
          type: "boolean",
          description:
            "True only when the caller described an emergency, a medical or safety concern, or serious distress.",
          required: false,
        },
      ],
    ),
  ];

  if (context.transferPhone) {
    specs.push({
      key: "transfer_call",
      body: {
        name: "Transfer to a person",
        description:
          "Put the caller through to a member of the team. Call this only when the caller has asked to speak to a person, or the situation is urgent. Say you are putting them through before you call it. If it does not connect, take a message instead.",
        category: "transfer_call",
        icon: "phone-forwarded",
        definition: {
          schema_version: 1,
          type: "transfer_call",
          config: {
            destination_source: "static",
            destination: context.transferPhone,
            messageType: "none",
            timeout: 30,
          },
        },
      },
    });
  }

  return specs;
}

/**
 * Creates or updates this business's tools in Dograh and returns their uuids.
 * Tools that no longer apply (a transfer tool after the number was removed)
 * keep their stored uuid but are simply not attached to any node.
 */
export async function ensureBusinessAgentTools(
  client: DograhManagementClient,
  context: AgentToolContext,
  stored: Record<string, string>,
): Promise<Partial<Record<AgentToolKey, string>>> {
  const uuids: Record<string, string> = { ...stored };
  for (const spec of agentToolSpecs(context)) {
    const existing = stored[spec.key];
    if (existing) {
      try {
        const updated = await client.updateTool(existing, spec.body);
        uuids[spec.key] = updated.tool_uuid;
        continue;
      } catch (error) {
        if (!(error instanceof DograhError && error.status === 404)) throw error;
      }
    }
    const created = await client.createTool(spec.body);
    uuids[spec.key] = created.tool_uuid;
  }

  const changed = Object.keys(uuids).some((key) => stored[key] !== uuids[key]);
  if (changed) {
    await db
      .update(businessDograhMappings)
      .set({ agentToolUuids: uuids, updatedAt: new Date() })
      .where(and(eq(businessDograhMappings.businessId, context.businessId)));
  }
  return uuids as Partial<Record<AgentToolKey, string>>;
}
