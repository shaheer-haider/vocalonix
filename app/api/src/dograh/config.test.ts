import { describe, expect, test } from "bun:test";

import { env } from "../env";

import {
  stableConfigurationHash,
  tenantDesiredConfiguration,
  withAgentToolUuids,
  type TenantBookingProfile,
  type TenantCapabilities,
  type TenantWorkflowInput,
} from "./config";
import type { TenantAgentSettings } from "./types";

const settings: TenantAgentSettings = {
  agentName: "Nova",
  greeting: "Hello",
  prompt: "Answer from the saved context.",
  closing: "Goodbye",
  tone: "warm",
  voice: "aria",
  allowInterrupt: true,
  escalationGuidance: "Offer a team follow-up when human help is needed.",
  transferPhone: "",
  businessHours: {
    Monday: { enabled: true, open: "09:00", close: "17:00" },
    Sunday: { enabled: false, open: "09:00", close: "17:00" },
  },
  widgetButtonText: "Talk to us",
  widgetColor: "#5b5bd6",
  allowedDomains: ["example.com"],
};

const booking: TenantBookingProfile = {
  enabled: true,
  services: [
    { name: "Cut & blow-dry", durationMinutes: 45, price: "£45" },
    { name: "Colour", durationMinutes: 90, price: "" },
  ],
};

function desired(
  businessId: string,
  overrides: Partial<TenantWorkflowInput> & {
    voiceOverride?: Record<string, unknown> | null;
  } = {},
  settingsOverrides: Partial<TenantAgentSettings> = {},
) {
  return tenantDesiredConfiguration({
    business: {
      id: businessId,
      name: `Business ${businessId}`,
      city: "Austin",
      country: "US",
      timezone: "America/Chicago",
      vertical: "salon",
    },
    settings: { ...settings, ...settingsOverrides },
    documentUuids: ["document-a"],
    ...overrides,
  });
}

function nodeIds(configuration: ReturnType<typeof desired>): string[] {
  const nodes = configuration.workflowDefinition.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes.map((node) => String((node as Record<string, unknown>).id));
}

function nodeData(
  configuration: ReturnType<typeof desired>,
  id: string,
): Record<string, unknown> {
  const nodes = configuration.workflowDefinition.nodes as Record<string, unknown>[];
  const node = nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`Node ${id} is missing`);
  return node.data as Record<string, unknown>;
}

function documentUuids(configuration: ReturnType<typeof desired>): string[][] {
  const nodes = configuration.workflowDefinition.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes.flatMap((node) => {
    const data = (node as Record<string, unknown>).data;
    if (!data || typeof data !== "object") return [];
    const documents = (data as Record<string, unknown>).document_uuids;
    return Array.isArray(documents) && documents.length > 0
      ? [documents.filter((value): value is string => typeof value === "string")]
      : [];
  });
}

describe("tenant Dograh configuration", () => {
  test("stable hashing ignores object key and document input order", () => {
    expect(stableConfigurationHash({ b: 2, a: { z: 3, y: 4 } })).toBe(
      stableConfigurationHash({ a: { y: 4, z: 3 }, b: 2 }),
    );
    expect(desired("a", { documentUuids: ["second", "first"] }).hash).toBe(
      desired("a", { documentUuids: ["first", "second"] }).hash,
    );
  });

  test("two businesses receive distinct owned workflows", () => {
    const businessA = desired("business-a");
    const businessB = desired("business-b");
    expect(businessA.name).not.toBe(businessB.name);
    expect(businessA.hash).not.toBe(businessB.hash);
    expect(businessA.workflowDefinition).toMatchObject({
      metadata: {
        managed_by: "vocalonix",
        vocalonix: { business_id: "business-a" },
      },
    });
  });

  test("updating business A does not change business B configuration", () => {
    const before = desired("business-b");
    const changed = desired("business-a", {}, { greeting: "A-only update" });
    const after = desired("business-b");
    expect(after.hash).toBe(before.hash);
    expect(changed.hash).not.toBe(after.hash);
  });

  test("the graph routes questions, bookings, handover and messages", () => {
    const configuration = desired("business-a", { booking });
    expect(nodeIds(configuration)).toEqual(
      expect.arrayContaining([
        "vocalonix-global",
        "vocalonix-start",
        "vocalonix-answer",
        "vocalonix-book",
        "vocalonix-handover",
        "vocalonix-message",
        "vocalonix-end",
        "vocalonix-end-early",
      ]),
    );
    expect(configuration.toolKeys).toEqual([
      "book_appointment",
      "check_availability",
      "take_message",
    ]);
  });

  test("the booking branch disappears when nothing is bookable", () => {
    const configuration = desired("business-a", {
      booking: { enabled: false, services: [] },
    });
    expect(nodeIds(configuration)).not.toContain("vocalonix-book");
    expect(configuration.toolKeys).toEqual(["take_message"]);
    const global = String(nodeData(configuration, "vocalonix-global").prompt);
    expect(global).toContain("book, move or cancel appointments");
  });

  test("the global prompt carries live local time and the real opening hours", () => {
    const global = String(
      nodeData(desired("business-a"), "vocalonix-global").prompt,
    );
    expect(global).toContain("{{current_time_America/Chicago}}");
    expect(global).toContain("Monday: 09:00–17:00");
    expect(global).toContain("Sunday: closed");
  });

  test("trade rules reach the agent", () => {
    const global = String(
      nodeData(desired("business-a"), "vocalonix-global").prompt,
    );
    expect(global).toContain("Colour, chemical and extension work");
  });

  test("transfers are only offered when a phone leg and a target both exist", () => {
    const withPhone: TenantCapabilities = {
      telephony: true,
      transfer: true,
      takeMessage: true,
    };
    const transferable = desired(
      "business-a",
      { capabilities: withPhone },
      { transferPhone: "+14155550123" },
    );
    expect(transferable.toolKeys).toContain("transfer_call");
    expect(String(nodeData(transferable, "vocalonix-handover").prompt)).toContain(
      "transfer_call",
    );

    const browserOnly = desired("business-a");
    expect(browserOnly.toolKeys).not.toContain("transfer_call");
    expect(String(nodeData(browserOnly, "vocalonix-handover").prompt)).toContain(
      "Never say \"putting you through\"",
    );
  });

  test("the demo agent never promises a message it cannot take", () => {
    const demo = desired("demo-1", {
      capabilities: { telephony: false, transfer: false, takeMessage: false },
      booking: { enabled: false, services: [] },
    });
    expect(nodeIds(demo)).not.toContain("vocalonix-message");
    expect(demo.toolKeys).toEqual([]);
    expect(String(nodeData(demo, "vocalonix-handover").prompt)).toContain(
      "Never promise a callback",
    );
  });

  test("the workflow never carries provider credentials by default", () => {
    const configuration = desired("business-a", { booking });
    expect(JSON.stringify(configuration.workflowDefinition)).not.toContain("api_key");
    expect(configuration.workflowConfigurations).not.toHaveProperty(
      "model_configuration_v2_override",
    );
  });

  test("a per-business voice becomes a workflow-level model override", () => {
    const configuration = desired("business-a", {
      voiceOverride: { version: 2, mode: "byok" },
    });
    expect(configuration.workflowConfigurations).toHaveProperty(
      "model_configuration_v2_override",
      { version: 2, mode: "byok" },
    );
    expect(configuration.hash).not.toBe(desired("business-a").hash);
  });

  test("changing the voice re-syncs the workflow", () => {
    expect(desired("business-a", {}, { voice: "hugo" }).hash).not.toBe(
      desired("business-a", {}, { voice: "aria" }).hash,
    );
  });

  test("replacement stages attach new knowledge before removing old knowledge", () => {
    const prior = desired("business-a", { documentUuids: ["old"] });
    const attachment = desired("business-a", { documentUuids: ["old", "new"] });
    const cleanup = desired("business-a", { documentUuids: ["new"] });
    expect(documentUuids(prior)).toEqual([["old"], ["old"]]);
    expect(documentUuids(attachment)).toEqual([
      ["new", "old"],
      ["new", "old"],
    ]);
    expect(documentUuids(cleanup)).toEqual([["new"], ["new"]]);
    expect(prior.hash).not.toBe(attachment.hash);
    expect(attachment.hash).not.toBe(cleanup.hash);
  });

  test("tool uuids only land on the nodes that asked for them", () => {
    const configuration = desired("business-a", { booking });
    const resolved = withAgentToolUuids(
      configuration.workflowDefinition,
      configuration.nodeToolKeys,
      {
        check_availability: "uuid-availability",
        book_appointment: "uuid-book",
        take_message: "uuid-message",
        transfer_call: "uuid-transfer",
      },
    );
    const nodes = resolved.nodes as Record<string, unknown>[];
    const byId = (id: string) =>
      (nodes.find((node) => node.id === id)!.data as Record<string, unknown>)
        .tool_uuids;
    expect(byId("vocalonix-book")).toEqual(["uuid-availability", "uuid-book"]);
    expect(byId("vocalonix-message")).toEqual(["uuid-message"]);
    // The answer node has no tools, so the unused transfer uuid never reaches it.
    expect(byId("vocalonix-answer")).toEqual([]);
  });
});

describe("configuration hash covers the tool address", () => {
  test("moving the API changes the hash, so agents get re-registered", () => {
    // The tool URL is baked into each tool at registration time. If it is not
    // hashed, a deployment that moves the API leaves every hash unchanged,
    // every sync decides "no-op", and every agent keeps calling an address
    // that no longer resolves — talking fine, unable to book anything.
    const original = env.vocalonixInternalUrl;
    const before = desired("business-a").hash;
    try {
      (env as { vocalonixInternalUrl: string }).vocalonixInternalUrl =
        "https://elsewhere.example.com";
      expect(desired("business-a").hash).not.toBe(before);
    } finally {
      (env as { vocalonixInternalUrl: string }).vocalonixInternalUrl = original;
    }
  });

  test("an unchanged address still hashes stably", () => {
    expect(desired("business-a").hash).toBe(desired("business-a").hash);
  });
});
