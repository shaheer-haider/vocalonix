import { describe, expect, test } from "bun:test";

import {
  stableConfigurationHash,
  tenantDesiredConfiguration,
} from "./config";
import type { TenantAgentSettings } from "./types";

const settings: TenantAgentSettings = {
  agentName: "Nova",
  greeting: "Hello",
  prompt: "Answer from the saved context.",
  closing: "Goodbye",
  tone: "warm",
  voice: "natural",
  allowInterrupt: true,
  escalationGuidance: "Offer a team follow-up when human help is needed.",
  businessHours: {
    Monday: { enabled: true, open: "09:00", close: "17:00" },
  },
  widgetButtonText: "Talk to us",
  widgetColor: "#5b5bd6",
  allowedDomains: ["example.com"],
};

function desired(
  businessId: string,
  overrides: Partial<TenantAgentSettings> = {},
  documentUuids = ["document-a"],
) {
  return tenantDesiredConfiguration({
    business: {
      id: businessId,
      name: `Business ${businessId}`,
      city: "Austin",
      country: "US",
      timezone: "America/Chicago",
      vertical: "services",
    },
    settings: { ...settings, ...overrides },
    documentUuids,
  });
}

function documentUuids(configuration: ReturnType<typeof desired>): string[][] {
  const nodes = configuration.workflowDefinition.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes.flatMap((node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return [];
    const data = (node as Record<string, unknown>).data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return [];
    const documents = (data as Record<string, unknown>).document_uuids;
    return Array.isArray(documents)
      ? [documents.filter((value): value is string => typeof value === "string")]
      : [];
  });
}

describe("tenant Dograh configuration", () => {
  test("stable hashing ignores object key and document input order", () => {
    expect(stableConfigurationHash({ b: 2, a: { z: 3, y: 4 } })).toBe(
      stableConfigurationHash({ a: { y: 4, z: 3 }, b: 2 }),
    );
    expect(desired("a", {}, ["second", "first"]).hash).toBe(
      desired("a", {}, ["first", "second"]).hash,
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
    expect(businessB.workflowDefinition).toMatchObject({
      metadata: {
        vocalonix: { business_id: "business-b" },
      },
    });
  });

  test("updating business A does not change business B configuration", () => {
    const businessBBefore = desired("business-b");
    const businessAAfter = desired("business-a", { greeting: "A-only update" });
    const businessBAfter = desired("business-b");
    expect(businessBAfter.hash).toBe(businessBBefore.hash);
    expect(businessAAfter.hash).not.toBe(businessBAfter.hash);
  });

  test("workflow claims and configuration stay within supported web-call scope", () => {
    const configuration = desired("business-a");
    const serialized = JSON.stringify(configuration);
    expect(serialized).toContain("browser-based voice agent");
    expect(serialized).toContain("attached knowledge");
    expect(serialized).toContain(
      "Never claim booking, live availability, SMS, payments, phone routing",
    );
    expect(configuration.workflowConfigurations).not.toHaveProperty(
      "model_configuration",
    );
    expect(configuration.workflowConfigurations).not.toHaveProperty("api_key");
  });

  test("replacement stages attach new knowledge before removing old knowledge", () => {
    const prior = desired("business-a", {}, ["old"]);
    const attachment = desired("business-a", {}, ["old", "new"]);
    const cleanup = desired("business-a", {}, ["new"]);
    expect(documentUuids(prior)).toEqual([
      ["old"],
      ["old"],
    ]);
    expect(documentUuids(attachment)).toEqual([
      ["new", "old"],
      ["new", "old"],
    ]);
    expect(documentUuids(cleanup)).toEqual([
      ["new"],
      ["new"],
    ]);
    expect(prior.hash).not.toBe(attachment.hash);
    expect(attachment.hash).not.toBe(cleanup.hash);
  });
});
