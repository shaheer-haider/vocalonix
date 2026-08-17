/**
 * The reusable demo agents.
 *
 * One published workflow per live trade, reconciled at boot. A visitor who
 * picks a trade gets that agent's embed token straight from Postgres, so the
 * demo starts in one round trip instead of four — and the engine stops
 * accumulating one dead workflow per curious visitor.
 */

import { eq } from "drizzle-orm";

import { db } from "../db/client";
import { demoAgents } from "../db/schema";
import { dograh, DograhError, type DograhManagementClient } from "../dograh/client";
import { VERTICALS, type VerticalConfig } from "../verticals";
import { buildDemoWorkflow, type DemoWorkflowInput } from "./workflow";

/** The demo agent's identity, derived entirely from the trade. */
function demoInputFor(vertical: VerticalConfig): DemoWorkflowInput {
  return {
    // Stable per trade rather than per session: this is what makes the agent
    // reusable, and it is what the config hash is computed over.
    sessionId: `demo-${vertical.slug}`,
    businessName: vertical.demoBusinessName,
    city: null,
    country: "US",
    timezone: "America/New_York",
    vertical: vertical.slug,
    services: vertical.defaultServices,
    verticalAnswers: {},
    voice: null,
    agentName: "Ava",
  };
}

export interface DemoAgentHandle {
  workflowId: number;
  embedToken: string;
}

/**
 * Creates or updates the demo agent for one trade, and returns its handle.
 *
 * The hash check is the whole point: without it, every boot would rewrite and
 * republish five workflows on an engine that had nothing wrong with them.
 */
export async function reconcileDemoAgent(
  vertical: VerticalConfig,
  client: DograhManagementClient = dograh,
): Promise<DemoAgentHandle> {
  const built = buildDemoWorkflow(demoInputFor(vertical));

  const [existing] = await db
    .select()
    .from(demoAgents)
    .where(eq(demoAgents.vertical, vertical.slug))
    .limit(1);

  if (existing && existing.configHash === built.hash) {
    return {
      workflowId: existing.workflowId,
      embedToken: existing.embedToken,
    };
  }

  let workflowId: number | null = existing?.workflowId ?? null;
  let workflowUuid: string | null = existing?.workflowUuid ?? null;

  if (workflowId !== null) {
    // A workflow we recorded can still be gone — an operator may have pruned it
    // in the Dograh UI. Falling back to a create keeps the demo working instead
    // of failing every visitor until somebody notices.
    try {
      await client.updateWorkflow(
        workflowId,
        built.name,
        built.workflowDefinition,
        built.workflowConfigurations,
      );
    } catch (error) {
      if (error instanceof DograhError && error.status === 404) {
        workflowId = null;
        workflowUuid = null;
      } else {
        throw error;
      }
    }
  }

  if (workflowId === null) {
    const created = await client.createWorkflow(
      built.name,
      built.workflowDefinition,
    );
    workflowId = created.id;
    workflowUuid = created.workflow_uuid ?? null;
    await client.updateWorkflow(
      workflowId,
      built.name,
      built.workflowDefinition,
      built.workflowConfigurations,
    );
  }

  await client.publishWorkflow(workflowId);
  const token = await client.createEmbedToken(workflowId, {
    embedMode: "headless",
    autoStart: false,
    agentName: built.settings.agentName,
    businessName: vertical.demoBusinessName,
  });

  await db
    .insert(demoAgents)
    .values({
      vertical: vertical.slug,
      workflowId,
      workflowUuid,
      embedToken: token.token,
      configHash: built.hash,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: demoAgents.vertical,
      set: {
        workflowId,
        workflowUuid,
        embedToken: token.token,
        configHash: built.hash,
        updatedAt: new Date(),
      },
    });

  return { workflowId, embedToken: token.token };
}

/**
 * Boot reconciliation for every trade the demo actually offers.
 *
 * Trades that are not live are skipped, because the demo route refuses them
 * anyway and provisioning them would put unreachable agents on the engine.
 * One trade failing must not take the others down — a visitor picking a
 * working trade should still get a demo.
 */
export async function reconcileDemoAgents(
  client: DograhManagementClient = dograh,
): Promise<{ reconciled: number; failed: number }> {
  const live = VERTICALS.filter((vertical) => vertical.status === "live");
  let reconciled = 0;
  let failed = 0;

  for (const vertical of live) {
    try {
      await reconcileDemoAgent(vertical, client);
      reconciled += 1;
    } catch (error) {
      failed += 1;
      console.error(`Demo agent reconciliation failed for ${vertical.slug}:`, error);
    }
  }

  return { reconciled, failed };
}

/**
 * The handle a demo session needs, provisioning on demand if boot has not
 * caught up yet — a visitor arriving in the first seconds after a deploy
 * should not get an error.
 */
export async function demoAgentFor(
  vertical: VerticalConfig,
  client: DograhManagementClient = dograh,
): Promise<DemoAgentHandle> {
  const [existing] = await db
    .select()
    .from(demoAgents)
    .where(eq(demoAgents.vertical, vertical.slug))
    .limit(1);
  if (existing) {
    return {
      workflowId: existing.workflowId,
      embedToken: existing.embedToken,
    };
  }
  return reconcileDemoAgent(vertical, client);
}
