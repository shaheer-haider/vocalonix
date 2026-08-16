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
import {
  findOwnedNumber,
  purchaseNumber,
  releaseOwnedNumber,
  TelnyxError,
} from "./telnyx";

const SETTINGS_KEY = "dograh.telephony";
const CONFIG_NAME = "Vocalonix";

/**
 * One number per business. A second number on the same agent would ring the
 * same workflow with no way for the caller — or the conversation list — to tell
 * the two apart, so the limit is a product rule rather than a provider one.
 * `business_phone_numbers_one_live_per_business` enforces the same thing in the
 * database, because this check alone races two concurrent purchases.
 */
const MAX_NUMBERS_PER_BUSINESS = 1;

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

/**
 * Buys `raw` on the platform's Telnyx account and points it at this business's
 * agent.
 *
 * The two halves are ordered so the recoverable failure is the one that can
 * happen: a number we own but cannot route is released again before returning,
 * because that is the state that quietly bills us every month for a line no
 * caller reaches. A number routed but not owned cannot occur — the order comes
 * first.
 */
export async function provisionPhoneNumber(input: {
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

  const live = await db
    .select({ id: businessPhoneNumbers.id })
    .from(businessPhoneNumbers)
    .where(
      and(
        eq(businessPhoneNumbers.businessId, input.businessId),
        ne(businessPhoneNumbers.status, "released"),
      ),
    );
  if (live.length >= MAX_NUMBERS_PER_BUSINESS) {
    throw new ApiError(
      409,
      "PHONE_NUMBER_LIMIT",
      "This agent already has a phone number. Release it before choosing another.",
    );
  }

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

  // A number we already hold is a retry of a half-finished purchase, not a
  // second rental — and it must not be released if the routing step fails.
  let purchasedHere = false;
  try {
    if (!(await findOwnedNumber(e164))) {
      await purchaseNumber(e164);
      purchasedHere = true;
    }
  } catch (error) {
    const message =
      error instanceof TelnyxError
        ? error.message
        : "Telnyx could not sell that number.";
    // Released, not failed: nothing was bought, so this attempt must not
    // occupy the business's one slot. `failed` counts as live for both the
    // limit check and the unique index, which would leave a customer whose
    // purchase failed unable to ever try again.
    await db
      .update(businessPhoneNumbers)
      .set({
        status: "released",
        lastError: message,
        releasedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(businessPhoneNumbers.id, id));
    throw new ApiError(502, "PHONE_NUMBER_UNAVAILABLE", message);
  }

  // Dograh may already know the number from an earlier attempt; re-point it
  // rather than failing on the provider's uniqueness check.
  try {
    const remote = await client.listPhoneNumbers(configId);
    const existingRemote = remote.find(
      (row) => row.address_normalized === e164 || row.address === e164,
    );

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
    // Hand back what we just bought; keeping it would bill us for a line no
    // caller can reach.
    if (purchasedHere) {
      await releaseOwnedNumber(e164).catch(() => undefined);
    }
    await db
      .update(businessPhoneNumbers)
      .set({
        status: purchasedHere ? "released" : "failed",
        lastError: message,
        ...(purchasedHere ? { releasedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
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

  // Stop the rental. Un-routing alone leaves us paying Telnyx every month for a
  // number the customer has already given up.
  await releaseOwnedNumber(row.e164);

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

/**
 * Dials `toNumber` with this business's agent, from this business's own number.
 *
 * The caller ID is not cosmetic: without it the engine picks whichever number
 * the shared configuration offers first, so one tenant's callback would show
 * another tenant's number. A business that has not bought a number therefore
 * cannot dial out at all, which is the correct answer rather than a fallback.
 */
export async function placeOutboundCall(input: {
  businessId: string;
  toNumber: string;
  client?: DograhManagementClient;
}): Promise<{ from: string }> {
  const client = input.client ?? dograh;
  const to = normalizeE164(input.toNumber);
  const workflowId = await workflowIdFor(input.businessId);

  const [caller] = await db
    .select({
      e164: businessPhoneNumbers.e164,
      configId: businessPhoneNumbers.dograhConfigId,
      phoneNumberId: businessPhoneNumbers.dograhPhoneNumberId,
    })
    .from(businessPhoneNumbers)
    .where(
      and(
        eq(businessPhoneNumbers.businessId, input.businessId),
        eq(businessPhoneNumbers.status, "active"),
      ),
    )
    .limit(1);

  if (!caller?.configId || !caller.phoneNumberId) {
    throw new ApiError(
      409,
      "OUTBOUND_NEEDS_NUMBER",
      "Get a phone number for this agent before calling people back — outbound calls are made from your own number.",
    );
  }

  try {
    await client.initiateCall({
      workflow_id: workflowId,
      phone_number: to,
      telephony_configuration_id: caller.configId,
      from_phone_number_id: caller.phoneNumberId,
    });
  } catch (error) {
    throw new ApiError(
      502,
      "OUTBOUND_CALL_FAILED",
      error instanceof DograhError
        ? error.message
        : "The telephony provider would not place that call.",
    );
  }

  return { from: caller.e164 };
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
