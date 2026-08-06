import { and, eq } from "drizzle-orm";

import { db } from "../db/client";
import { businessDograhMappings } from "../db/schema";
import { env } from "../env";
import type { DograhManagementClient } from "./client";
import { DograhError } from "./client";

export const AGENT_TOOL_KEYS = ["check_availability", "book_appointment"] as const;

export type AgentToolKey = (typeof AGENT_TOOL_KEYS)[number];

export interface AgentToolSpec {
  key: AgentToolKey;
  body: Record<string, unknown>;
}

function toolEndpoint(businessId: string, path: string): string {
  return `${env.vocalonixInternalUrl}/api/agent-tools/${businessId}/${path}`;
}

export function agentToolSpecs(businessId: string): AgentToolSpec[] {
  const headers = { "x-vocalonix-agent-key": env.agentToolSecret };
  return [
    {
      key: "check_availability",
      body: {
        name: "Check booking availability",
        description:
          "Look up open appointment slots for a service on a given day. Call this before offering or confirming any appointment time. Returns the bookable services when the service name does not match.",
        category: "http_api",
        icon: "calendar",
        definition: {
          schema_version: 1,
          type: "http_api",
          config: {
            method: "POST",
            url: toolEndpoint(businessId, "availability"),
            headers,
            timeout_ms: 8000,
            parameters: [
              {
                name: "service",
                type: "string",
                description:
                  "The service the caller wants, as they said it (for example: check-up, hygiene).",
                required: true,
              },
              {
                name: "date",
                type: "string",
                description:
                  "The requested day in YYYY-MM-DD format in the business timezone. Omit for today.",
                required: false,
              },
            ],
          },
        },
      },
    },
    {
      key: "book_appointment",
      body: {
        name: "Book appointment",
        description:
          "Book an appointment slot for the caller. Only call this after the caller confirmed the service, the day, the time, and their name. Returns a confirmation to read back, or the reason the slot could not be booked.",
        category: "http_api",
        icon: "calendar-check",
        definition: {
          schema_version: 1,
          type: "http_api",
          config: {
            method: "POST",
            url: toolEndpoint(businessId, "book"),
            headers,
            timeout_ms: 8000,
            parameters: [
              {
                name: "service",
                type: "string",
                description: "The service to book, as offered by check availability.",
                required: true,
              },
              {
                name: "date",
                type: "string",
                description: "The day to book in YYYY-MM-DD format in the business timezone.",
                required: true,
              },
              {
                name: "time",
                type: "string",
                description:
                  "The start time to book in 24-hour HH:MM format in the business timezone, matching an open slot.",
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
          },
        },
      },
    },
  ];
}

export async function ensureBusinessAgentTools(
  client: DograhManagementClient,
  businessId: string,
  stored: Record<string, string>,
): Promise<Record<AgentToolKey, string>> {
  const uuids: Record<string, string> = {};
  for (const spec of agentToolSpecs(businessId)) {
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

  const changed = AGENT_TOOL_KEYS.some((key) => stored[key] !== uuids[key]);
  if (changed) {
    await db
      .update(businessDograhMappings)
      .set({ agentToolUuids: uuids, updatedAt: new Date() })
      .where(and(eq(businessDograhMappings.businessId, businessId)));
  }
  return uuids as Record<AgentToolKey, string>;
}
