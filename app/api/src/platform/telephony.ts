/**
 * PSTN numbers for tenant agents, on top of Dograh's telephony layer.
 *
 * Dograh already speaks Telnyx: an organisation-level telephony configuration
 * holds the credentials, and each phone number under it carries an
 * `inbound_workflow_id` that decides which agent answers. Vocalonix provisions
 * that configuration once from the environment, then maps numbers to
 * businesses one row at a time.
 *
 * The Telnyx API key never leaves the server, and a workspace can only ever act
 * on numbers its own `business_phone_numbers` rows claim.
 */

import { randomUUID } from "node:crypto";

import { and, eq, ne } from "drizzle-orm";

import { db } from "../db/client";
import {
  businessDograhMappings,
  businessPhoneNumbers,
  platformSettings,
} from "../db/schema";
import { dograh, DograhError } from "../dograh/client";
import type { DograhManagementClient } from "../dograh/client";
import { env } from "../env";
import { ApiError } from "../errors";

const SETTINGS_KEY = "dograh.telephony";
const CONFIG_NAME = "Vocalonix";

export interface TelephonyStatus {
  configured: boolean;
  provider: "telnyx" | null;
  configId: number | null;
  reason?: string;
  lastError?: string;
}

interface StoredState extends Record<string, unknown> {
  configId?: number;
  lastError?: string | null;
}

async function readState(): Promise<StoredState> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, SETTINGS_KEY))
    .limit(1);
  return (row?.value as StoredState | undefined) ?? {};
}

async function writeState(state: StoredState): Promise<void> {
  await db
    .insert(platformSettings)
    .values({ key: SETTINGS_KEY, value: state, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value: state, updatedAt: new Date() },
    });
}

function credentials(): Record<string, unknown> {
  return {
    provider: "telnyx",
    api_key: env.telnyxApiKey,
    ...(env.telnyxConnectionId ? { connection_id: env.telnyxConnectionId } : {}),
    ...(env.telnyxWebhookPublicKey
      ? { webhook_public_key: env.telnyxWebhookPublicKey }
      : {}),
  };
}

/**
 * Returns the Dograh telephony configuration id, creating or updating it so it
 * always carries the current key. Adopts a configuration that already exists
 * under our name rather than creating a duplicate on every redeploy.
 */
export async function ensureTelephonyConfiguration(
  client: DograhManagementClient = dograh,
): Promise<number> {
  if (!env.telnyxApiKey) {
    throw new ApiError(
      503,
      "TELEPHONY_NOT_CONFIGURED",
      "Phone numbers need TELNYX_API_KEY in the server environment.",
    );
  }

  const state = await readState();
  const existing = await client.listTelephonyConfigurations();
  const adopted =
    (state.configId
      ? existing.find((row) => row.id === state.configId)
      : undefined) ??
    existing.find((row) => row.provider === "telnyx" && row.name === CONFIG_NAME);

  if (adopted) {
    // Refresh credentials so a rotated key takes effect without manual work.
    await client.updateTelephonyConfiguration(adopted.id, {
      config: credentials(),
    });
    if (state.configId !== adopted.id || state.lastError) {
      await writeState({ configId: adopted.id, lastError: null });
    }
    return adopted.id;
  }

  const created = await client.createTelephonyConfiguration({
    name: CONFIG_NAME,
    is_default_outbound: true,
    config: credentials(),
  });
  await writeState({ configId: created.id, lastError: null });
  return created.id;
}

export async function telephonyStatus(): Promise<TelephonyStatus> {
  if (!env.telnyxApiKey) {
    return {
      configured: false,
      provider: null,
      configId: null,
      reason:
        "Add TELNYX_API_KEY to the server environment to buy and route phone numbers.",
    };
  }
  const state = await readState();
  return {
    configured: true,
    provider: "telnyx",
    configId: state.configId ?? null,
    ...(state.lastError ? { lastError: state.lastError } : {}),
  };
}

async function workflowIdFor(businessId: string): Promise<number> {
  const [mapping] = await db
    .select({ workflowId: businessDograhMappings.workflowId })
    .from(businessDograhMappings)
    .where(eq(businessDograhMappings.businessId, businessId))
    .limit(1);
  const workflowId = mapping?.workflowId ? Number(mapping.workflowId) : NaN;
  if (!Number.isFinite(workflowId)) {
    throw new ApiError(
      409,
      "AGENT_NOT_PUBLISHED",
      "Publish the agent before pointing a phone number at it.",
    );
  }
  return workflowId;
}

/** E.164 is the only shape Dograh routes reliably, so normalise before storing. */
export function normalizeE164(raw: string): string {
  const trimmed = raw.trim().replace(/[\s\-().]/g, "");
  if (!/^\+\d{8,15}$/.test(trimmed)) {
    throw new ApiError(
      400,
      "PHONE_NUMBER_INVALID",
      "Enter the number in full international format, for example +14155550123.",
    );
  }
  return trimmed;
}

export interface AttachedPhoneNumber {
  id: string;
  e164: string;
  label: string;
  status: "pending" | "active" | "failed" | "released";
}

export async function attachPhoneNumber(input: {
  businessId: string;
  raw: string;
  label: string;
  createdBy: string;
  client?: DograhManagementClient;
}): Promise<AttachedPhoneNumber> {
  const client = input.client ?? dograh;
  const e164 = normalizeE164(input.raw);
  const workflowId = await workflowIdFor(input.businessId);
  const configId = await ensureTelephonyConfiguration(client);

  const [claimed] = await db
    .select({ id: businessPhoneNumbers.id, businessId: businessPhoneNumbers.businessId })
    .from(businessPhoneNumbers)
    .where(
      and(
        eq(businessPhoneNumbers.e164, e164),
        ne(businessPhoneNumbers.status, "released"),
      ),
    )
    .limit(1);
  if (claimed) {
    throw new ApiError(
      409,
      "PHONE_NUMBER_TAKEN",
      claimed.businessId === input.businessId
        ? "That number is already connected to this agent."
        : "That number is already connected to another workspace.",
    );
  }

  // Dograh may already know the number from an earlier attempt; re-point it
  // rather than failing on the provider's uniqueness check.
  const remote = await client.listPhoneNumbers(configId);
  const existingRemote = remote.find(
    (row) => row.address_normalized === e164 || row.address === e164,
  );

  const id = randomUUID();
  await db.insert(businessPhoneNumbers).values({
    id,
    businessId: input.businessId,
    e164,
    label: input.label.trim(),
    countryCode: null,
    provider: "telnyx",
    dograhConfigId: configId,
    status: "pending",
    createdBy: input.createdBy,
  });

  try {
    const saved = existingRemote
      ? await client.updatePhoneNumber(configId, existingRemote.id, {
          label: input.label.trim() || undefined,
          inbound_workflow_id: workflowId,
          is_active: true,
        })
      : await client.createPhoneNumber(configId, {
          address: e164,
          label: input.label.trim() || undefined,
          inbound_workflow_id: workflowId,
          is_active: true,
        });

    const syncWarning =
      saved.provider_sync && saved.provider_sync.ok === false
        ? saved.provider_sync.message ??
          "Telnyx did not accept the inbound webhook for this number."
        : null;

    await db
      .update(businessPhoneNumbers)
      .set({
        dograhPhoneNumberId: saved.id,
        status: syncWarning ? "failed" : "active",
        lastError: syncWarning,
        updatedAt: new Date(),
      })
      .where(eq(businessPhoneNumbers.id, id));

    return {
      id,
      e164,
      label: input.label.trim(),
      status: syncWarning ? "failed" : "active",
    };
  } catch (error) {
    const message =
      error instanceof DograhError
        ? error.message
        : "The telephony provider rejected this number.";
    await db
      .update(businessPhoneNumbers)
      .set({ status: "failed", lastError: message, updatedAt: new Date() })
      .where(eq(businessPhoneNumbers.id, id));
    throw new ApiError(502, "PHONE_NUMBER_FAILED", message);
  }
}

export async function releasePhoneNumber(
  businessId: string,
  phoneNumberId: string,
  client: DograhManagementClient = dograh,
): Promise<void> {
  const [row] = await db
    .select()
    .from(businessPhoneNumbers)
    .where(
      and(
        eq(businessPhoneNumbers.id, phoneNumberId),
        eq(businessPhoneNumbers.businessId, businessId),
      ),
    )
    .limit(1);
  if (!row || row.status === "released") {
    throw new ApiError(404, "NOT_FOUND", "That phone number was not found.");
  }

  if (row.dograhConfigId && row.dograhPhoneNumberId) {
    await client
      .deletePhoneNumber(row.dograhConfigId, row.dograhPhoneNumberId)
      .catch((error: unknown) => {
        // A number already gone upstream should still release locally.
        if (error instanceof DograhError && error.status === 404) return;
        throw error;
      });
  }

  await db
    .update(businessPhoneNumbers)
    .set({
      status: "released",
      lastError: null,
      releasedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(businessPhoneNumbers.id, phoneNumberId));
}

/**
 * Re-points every live number at the business's current workflow. Called after
 * a sync recreates a workflow, which would otherwise leave inbound calls
 * ringing an archived agent.
 */
export async function syncPhoneNumberRouting(
  businessId: string,
  workflowId: number,
  client: DograhManagementClient = dograh,
): Promise<void> {
  const rows = await db
    .select()
    .from(businessPhoneNumbers)
    .where(
      and(
        eq(businessPhoneNumbers.businessId, businessId),
        ne(businessPhoneNumbers.status, "released"),
      ),
    );
  for (const row of rows) {
    if (!row.dograhConfigId || !row.dograhPhoneNumberId) continue;
    try {
      await client.updatePhoneNumber(row.dograhConfigId, row.dograhPhoneNumberId, {
        inbound_workflow_id: workflowId,
        is_active: true,
      });
      if (row.status !== "active" || row.lastError) {
        await db
          .update(businessPhoneNumbers)
          .set({ status: "active", lastError: null, updatedAt: new Date() })
          .where(eq(businessPhoneNumbers.id, row.id));
      }
    } catch (error) {
      const message =
        error instanceof DograhError
          ? error.message
          : "Could not re-point this number at the agent.";
      await db
        .update(businessPhoneNumbers)
        .set({ status: "failed", lastError: message, updatedAt: new Date() })
        .where(eq(businessPhoneNumbers.id, row.id));
    }
  }
}

export async function listBusinessPhoneNumbers(businessId: string) {
  return db
    .select({
      id: businessPhoneNumbers.id,
      e164: businessPhoneNumbers.e164,
      label: businessPhoneNumbers.label,
      status: businessPhoneNumbers.status,
      lastError: businessPhoneNumbers.lastError,
      createdAt: businessPhoneNumbers.createdAt,
    })
    .from(businessPhoneNumbers)
    .where(
      and(
        eq(businessPhoneNumbers.businessId, businessId),
        ne(businessPhoneNumbers.status, "released"),
      ),
    );
}
