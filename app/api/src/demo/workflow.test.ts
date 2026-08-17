import { describe, expect, test } from "bun:test";

import { VERTICALS, getVertical } from "../verticals";
import {
  DEMO_CALL_SECONDS,
  buildDemoWorkflow,
  type DemoWorkflowInput,
} from "./workflow";

function demoInput(overrides: Partial<DemoWorkflowInput> = {}): DemoWorkflowInput {
  return {
    sessionId: "demo-salon",
    businessName: "Willow & Co Hair Studio",
    city: null,
    country: "US",
    timezone: "America/New_York",
    vertical: "salon",
    services: ["Cut & blow-dry"],
    verticalAnswers: {},
    voice: null,
    agentName: "Ava",
    ...overrides,
  };
}

describe("buildDemoWorkflow", () => {
  test("is deterministic, so an unchanged trade is not republished every boot", () => {
    expect(buildDemoWorkflow(demoInput()).hash).toBe(
      buildDemoWorkflow(demoInput()).hash,
    );
  });

  test("different trades produce different agents", () => {
    const salon = buildDemoWorkflow(demoInput({ vertical: "salon" }));
    const barber = buildDemoWorkflow(
      demoInput({
        vertical: "barber",
        sessionId: "demo-barber",
        businessName: "Cutler Street Barbers",
      }),
    );
    expect(salon.hash).not.toBe(barber.hash);
  });

  test("the call limit is inside the hash", () => {
    // The limit lives in workflowConfigurations rather than the definition, so
    // if it were left out of the hash a change to it would never reach an
    // agent that had already been provisioned.
    const built = buildDemoWorkflow(demoInput());
    expect(built.workflowConfigurations.max_call_duration).toBe(
      DEMO_CALL_SECONDS,
    );
  });

  test("renaming the demo business changes the agent", () => {
    const before = buildDemoWorkflow(demoInput());
    const after = buildDemoWorkflow(
      demoInput({ businessName: "Somewhere Else Salon" }),
    );
    expect(before.hash).not.toBe(after.hash);
  });

  test("a demo agent never offers booking, transfer or messages", () => {
    // It has no diary, no phone leg and no callback queue behind it, so
    // offering any of them would be a promise it cannot keep.
    const built = buildDemoWorkflow(demoInput());
    const nodes = (built.workflowDefinition.nodes ?? []) as Array<
      Record<string, unknown>
    >;
    const ids = nodes.map((node) => node.id);
    expect(ids).not.toContain("vocalonix-book");
    expect(ids).not.toContain("vocalonix-message");
  });

  test("the greeting names the demo business rather than the trade slug", () => {
    const built = buildDemoWorkflow(demoInput());
    expect(built.settings.greeting).toContain("Willow & Co Hair Studio");
    expect(built.settings.greeting).not.toContain("salon demo");
  });
});

describe("demo business names", () => {
  test("every trade has one, so enabling a trade cannot ship a nameless agent", () => {
    for (const vertical of VERTICALS) {
      expect(vertical.demoBusinessName.trim().length).toBeGreaterThan(0);
    }
  });

  test("they are distinct, so two trades never answer as the same business", () => {
    const names = VERTICALS.map((vertical) => vertical.demoBusinessName);
    expect(new Set(names).size).toBe(names.length);
  });

  test("every live trade can actually be built", () => {
    for (const vertical of VERTICALS.filter((v) => v.status === "live")) {
      const config = getVertical(vertical.slug);
      expect(config).toBeTruthy();
      const built = buildDemoWorkflow(
        demoInput({
          vertical: vertical.slug,
          sessionId: `demo-${vertical.slug}`,
          businessName: vertical.demoBusinessName,
          services: vertical.defaultServices,
        }),
      );
      expect(built.hash).toBeTruthy();
      expect(built.settings.agentName).toBe("Ava");
    }
  });
});
