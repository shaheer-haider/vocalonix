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

import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";

import { db } from "../db/client";
import {
  businesses,
  businessDograhMappings,
  businessPhoneNumbers,
  platformSettings,
} from "../db/schema";
import { dograh, DograhError } from "../dograh/client";
import type { DograhManagementClient } from "../dograh/client";
import { env } from "../env";
import { ApiError } from "../errors";
import {
  bindNumberToConnection,
  fetchWebhookPublicKey,
  findOwnedNumber,
  listOwnedNumbers,
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

/**
 * Credentials for the Dograh telephony configuration.
 *
 * The webhook public key is fetched from Telnyx when the operator has not
 * supplied one. Dograh verifies the signature on every inbound webhook and
 * rejects the call outright when it cannot, so leaving this key to manual
 * configuration means a correctly bought and correctly routed number still
 * never rings, with nothing in the product to explain why. It is derivable
 * from the API key we already hold, so it is derived.
 *
 * `connection_id` stays absent only on first save: Dograh then creates a call
 * control application pointed at its own inbound dispatcher and stores the id
 * on the configuration, which is the arrangement we want. On every later save
 * the current value must be sent back, because Dograh only preserves omitted
 * fields that are marked sensitive — and `connection_id` is not one. An update
 * without it mints a second application and silently repoints the
 * configuration at it, orphaning every number bound to the first.
 */
async function credentials(
  currentConnectionId: string | null = null,
): Promise<Record<string, unknown>> {
  const supplied = env.telnyxWebhookPublicKey;
  // A failure here must not block provisioning — it costs inbound signature
  // verification, which `telephonyStatus` reports, not the purchase itself.
  const webhookPublicKey =
    supplied ?? (await fetchWebhookPublicKey().catch(() => null));

  const connectionId = env.telnyxConnectionId ?? currentConnectionId;

  return {
    provider: "telnyx",
    api_key: env.telnyxApiKey,
    ...(connectionId ? { connection_id: connectionId } : {}),
    ...(webhookPublicKey ? { webhook_public_key: webhookPublicKey } : {}),
  };
}

/**
 * The call control application this configuration delivers inbound calls to.
 *
 * Dograh creates the application on first save and stores its id in the
 * configuration's credentials, where it survives masking because it is not a
 * secret. Reading it back is the only way to learn which application our
 * numbers have to be bound to.
 */
async function connectionIdFor(
  configId: number,
  client: DograhManagementClient,
): Promise<string | null> {
  const detail = await client.getTelephonyConfiguration(configId);
  const raw = detail.credentials?.connection_id;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/**
 * Binds `e164` to the configuration's call control application, which is what
 * actually makes it ring.
 *
 * Owning a number, telling Dograh about it, and having Telnyx deliver its calls
 * are three separate things, and buying only establishes the first. An unbound
 * number reports `active` on Telnyx, appears correctly routed in Dograh, and
 * bills every month, but Telnyx holds no webhook for it and drops inbound calls
 * at the edge — silence, with no error raised anywhere. The binding is verified
 * by re-reading the number rather than trusting the write, because this is
 * exactly the failure that otherwise reports success at every step.
 */
async function bindForDelivery(
  e164: string,
  configId: number,
  client: DograhManagementClient,
): Promise<void> {
  const connectionId = await connectionIdFor(configId, client);
  if (!connectionId) {
    throw new ApiError(
      502,
      "PHONE_NUMBER_UNROUTABLE",
      "The telephony configuration has no call control application, so calls to this number could not be delivered.",
    );
  }

  const owned = await findOwnedNumber(e164);
  if (!owned) {
    throw new ApiError(
      502,
      "PHONE_NUMBER_UNROUTABLE",
      "Telnyx does not report this number as ours, so it could not be connected.",
    );
  }
  if (owned.connectionId === connectionId) return;

  await bindNumberToConnection(owned.id, connectionId);

  const confirmed = await findOwnedNumber(e164);
  if (confirmed?.connectionId !== connectionId) {
    throw new ApiError(
      502,
      "PHONE_NUMBER_UNROUTABLE",
      "Telnyx did not connect this number to the agent, so incoming calls would not have reached it.",
    );
  }
}

/**
 * Makes Dograh route `e164` to `workflowId`, creating the record or re-pointing
 * one it already holds.
 *
 * Dograh resolves an inbound call by joining the telephony configuration to an
 * *active* phone-number row carrying that address. A number missing from that
 * table, left inactive, or stored under a different address is unreachable no
 * matter how correctly Telnyx is bound — the dispatcher answers
 * `PHONE_NUMBER_NOT_CONFIGURED` and the caller hears ringing that never ends.
 */
async function ensureDograhRouting(input: {
  configId: number;
  e164: string;
  label: string;
  workflowId: number;
  client: DograhManagementClient;
}): Promise<{ id: number; syncWarning: string | null }> {
  const remote = await input.client.listPhoneNumbers(input.configId);
  const existingRemote = remote.find(
    (row) => row.address_normalized === input.e164 || row.address === input.e164,
  );

  const saved = existingRemote
    ? await input.client.updatePhoneNumber(input.configId, existingRemote.id, {
        label: input.label || undefined,
        inbound_workflow_id: input.workflowId,
        is_active: true,
      })
    : await input.client.createPhoneNumber(input.configId, {
        address: input.e164,
        label: input.label || undefined,
        inbound_workflow_id: input.workflowId,
        is_active: true,
      });

  return {
    id: saved.id,
    syncWarning:
      saved.provider_sync && saved.provider_sync.ok === false
        ? saved.provider_sync.message ??
          "Telnyx did not accept the inbound webhook for this number."
        : null,
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
    // Refresh credentials so a rotated key takes effect without manual work,
    // carrying the existing call control application forward — Dograh would
    // otherwise create a new one and strand the numbers bound to this one.
    const currentConnectionId = await connectionIdFor(adopted.id, client);
    await client.updateTelephonyConfiguration(adopted.id, {
      config: await credentials(currentConnectionId),
    });
    if (state.configId !== adopted.id || state.lastError) {
      await writeState({ configId: adopted.id, lastError: null });
    }
    return adopted.id;
  }

  // No connection to carry forward on first save: Dograh creates the call
  // control application and stores its id on the configuration.
  const created = await client.createTelephonyConfiguration({
    name: CONFIG_NAME,
    is_default_outbound: true,
    config: await credentials(),
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

/**
 * Whether `raw` could be dialled at all. Callers use this to decide what to
 * offer rather than to validate input: a callback may legitimately hold an
 * email address or a local number somebody will ring by hand.
 */
export function isDialable(raw: string): boolean {
  try {
    normalizeE164(raw);
    return true;
  } catch {
    return false;
  }
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
    // Before Dograh is told about the number, make sure Telnyx can actually
    // deliver its calls. A number that cannot be bound is worth no more than
    // one that cannot be routed, and both are released below.
    await bindForDelivery(e164, configId, client);

    const saved = await ensureDograhRouting({
      configId,
      e164,
      label: input.label.trim(),
      workflowId,
      client,
    });
    const syncWarning = saved.syncWarning;

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
    // Telnyx and binding failures already carry customer-facing wording; only
    // an unrecognised error needs a generic stand-in.
    const message =
      error instanceof DograhError ||
      error instanceof TelnyxError ||
      error instanceof ApiError
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

  // The number stays on our Telnyx account deliberately. Handing it back ends
  // the rental but also loses the number for good — a business that releases by
  // mistake, or one that moves workspaces, could never get the same number
  // again, and customers print these on vans. Unbound from Dograh it rings
  // nothing, and it shows up in the pool for the next business to claim.
  //
  // The standing cost of a parked number is the price of that: see
  // `listPooledNumbers`, which is what surfaces them so they get reused rather
  // than quietly accumulating.
  //
  // The number stays bound to the Telnyx connection, so an inbound call still
  // reaches Dograh and is dropped there for having no workflow, rather than
  // getting the carrier's "not in service". Callers hear a failed call either
  // way; clearing the binding would be tidier and is worth doing once the
  // provider's behaviour on an empty connection_id has been checked.
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

/**
 * Brings the telephony configuration and every live number back in line with
 * Telnyx on the way up.
 *
 * Three states drift silently and none raises an error anywhere: a
 * configuration saved before the webhook public key was fetched rejects every
 * inbound webhook, a number bought before binding existed is attached to no
 * call control application, and a number missing from Dograh's routing table
 * resolves to no workflow. In every case the product shows an active number
 * and the phone never rings — the third is worst, because the caller hears
 * ringing that is never answered — so all three are repaired at boot rather
 * than waiting for a customer to report silence.
 *
 * Failures are logged and skipped: one number we cannot reconcile should not
 * stop the API from starting, or block the numbers after it.
 */
export async function reconcileTelephonyConfiguration(
  client: DograhManagementClient = dograh,
): Promise<void> {
  if (!env.telnyxApiKey) return;

  const configId = await ensureTelephonyConfiguration(client);
  const connectionId = await connectionIdFor(configId, client);
  if (!connectionId) {
    console.error(
      "Telephony reconciliation: configuration has no call control application; inbound calls cannot be delivered.",
    );
    return;
  }

  const rows = await db
    .select({
      id: businessPhoneNumbers.id,
      businessId: businessPhoneNumbers.businessId,
      e164: businessPhoneNumbers.e164,
      label: businessPhoneNumbers.label,
    })
    .from(businessPhoneNumbers)
    .where(ne(businessPhoneNumbers.status, "released"));

  for (const row of rows) {
    try {
      const owned = await findOwnedNumber(row.e164);
      if (owned && owned.connectionId !== connectionId) {
        await bindNumberToConnection(owned.id, connectionId);
        console.log(
          `Telephony reconciliation: bound ${row.e164} to connection ${connectionId}.`,
        );
      }

      // Re-assert the routing record even when the binding was already right:
      // Telnyx delivering the call is no use if Dograh cannot resolve a
      // workflow for the number it was delivered to.
      const workflowId = await workflowIdFor(row.businessId);
      const saved = await ensureDograhRouting({
        configId,
        e164: row.e164,
        label: row.label,
        workflowId,
        client,
      });

      await db
        .update(businessPhoneNumbers)
        .set({
          dograhPhoneNumberId: saved.id,
          status: saved.syncWarning ? "failed" : "active",
          lastError: saved.syncWarning,
          updatedAt: new Date(),
        })
        .where(eq(businessPhoneNumbers.id, row.id));
    } catch (error) {
      console.error(
        `Telephony reconciliation: could not reconcile ${row.e164}:`,
        error,
      );
    }
  }
}

export interface PooledNumber {
  e164: string;
  /**
   * What to say about where this number has been. Deliberately not always the
   * business name — see `listPooledNumbers`.
   */
  previousUse: "yours" | "other" | "unused";
  previousBusinessName: string | null;
  releasedAt: string | null;
}

export interface ReleaseHistoryRow {
  e164: string;
  businessId: string;
  businessName: string | null;
  releasedAt: Date | null;
}

/**
 * Works out the pool from what we own, what is claimed, and who had what.
 *
 * Split out from the query so the rule that matters can be tested directly: a
 * number is offered only when the provider says we hold it and no live row
 * claims it, and the tenant who last had it is named only to themselves.
 * `history` is expected newest-first.
 */
export function derivePool(input: {
  owned: string[];
  liveClaims: string[];
  history: ReleaseHistoryRow[];
  viewerBusinessId: string;
}): PooledNumber[] {
  const live = new Set(input.liveClaims);
  const free = input.owned.filter((e164) => !live.has(e164));
  if (free.length === 0) return [];

  // History arrives newest-first, so the first row seen for a number is the
  // most recent time it was given up — the tenancy worth reporting.
  const lastUse = new Map<string, ReleaseHistoryRow>();
  for (const row of input.history) {
    if (!lastUse.has(row.e164)) lastUse.set(row.e164, row);
  }

  return free.map((e164) => {
    const previous = lastUse.get(e164);
    if (!previous) {
      // We own it but no business ever held it here — bought straight from the
      // provider, or claimed by an attempt that never got as far as a row.
      return {
        e164,
        previousUse: "unused" as const,
        previousBusinessName: null,
        releasedAt: null,
      };
    }
    const mine = previous.businessId === input.viewerBusinessId;
    return {
      e164,
      previousUse: mine ? ("yours" as const) : ("other" as const),
      previousBusinessName: mine ? previous.businessName : null,
      releasedAt: previous.releasedAt?.toISOString() ?? null,
    };
  });
}

/**
 * Numbers we pay for that no agent is answering on.
 *
 * Derived on every read rather than stored: the pool is whatever Telnyx says we
 * own minus whatever a business currently claims. There is no pool table to
 * drift out of step with the provider, so a number bought or released in the
 * Telnyx console shows up here correctly without anything having to reconcile.
 *
 * The previous tenant is reported by name only to the workspace that had it.
 * Every workspace can see that a number is parked and claim it, but naming the
 * business that used to answer on it would tell one customer another customer's
 * name and phone number, which is not theirs to learn.
 */
export async function listPooledNumbers(
  viewerBusinessId: string,
): Promise<PooledNumber[]> {
  const owned = await listOwnedNumbers();
  if (owned.length === 0) return [];

  const claimed = await db
    .select({ e164: businessPhoneNumbers.e164 })
    .from(businessPhoneNumbers)
    .where(ne(businessPhoneNumbers.status, "released"));

  const free = owned
    .map((number) => number.e164)
    .filter((e164) => !claimed.some((row) => row.e164 === e164));
  if (free.length === 0) return [];

  const history = await db
    .select({
      e164: businessPhoneNumbers.e164,
      businessId: businessPhoneNumbers.businessId,
      businessName: businesses.name,
      releasedAt: businessPhoneNumbers.releasedAt,
    })
    .from(businessPhoneNumbers)
    .leftJoin(businesses, eq(businessPhoneNumbers.businessId, businesses.id))
    .where(
      and(
        inArray(businessPhoneNumbers.e164, free),
        isNotNull(businessPhoneNumbers.releasedAt),
      ),
    )
    .orderBy(desc(businessPhoneNumbers.releasedAt));

  return derivePool({
    owned: owned.map((number) => number.e164),
    liveClaims: claimed.map((row) => row.e164),
    history,
    viewerBusinessId,
  });
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
