/**
 * Telnyx number inventory, on the platform's own account.
 *
 * Customers never see Telnyx. They search the inventory from the dashboard,
 * pick a number, and it is ordered against our account — so the monthly rental
 * lands on our bill, not theirs, and there is no key for them to paste.
 *
 * This module owns the provider API and nothing else: ordering a number here
 * does not point it at an agent. `telephony.ts` composes the two, because a
 * number that is billed but unrouted is the failure worth avoiding.
 */

import { env } from "../env";
import { ApiError } from "../errors";

const TELNYX_API = "https://api.telnyx.com/v2";
const REQUEST_TIMEOUT_MS = 20_000;

export class TelnyxError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TelnyxError";
  }
}

export interface AvailableNumber {
  e164: string;
  /** Human label for where the number rings, e.g. "San Francisco, CA". */
  locality: string | null;
  region: string | null;
  countryCode: string;
  monthlyCost: string | null;
  upfrontCost: string | null;
  currency: string | null;
}

export interface OwnedNumber {
  id: string;
  e164: string;
  status: string;
}

interface TelnyxErrorBody {
  errors?: { code?: string; title?: string; detail?: string }[];
}

/**
 * Telnyx reports failures as a list of `{title, detail}` objects. The detail is
 * written for the account holder ("This number is no longer available"), which
 * is exactly what the customer needs to read, so it is surfaced rather than
 * flattened into a generic provider error.
 */
function describe(body: unknown, fallback: string): string {
  const errors = (body as TelnyxErrorBody | undefined)?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return fallback;
  const parts = errors
    .map((entry) => entry?.detail?.trim() || entry?.title?.trim())
    .filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(" ") : fallback;
}

async function telnyxRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | undefined>;
  } = {},
): Promise<T> {
  if (!env.telnyxApiKey) {
    throw new ApiError(
      503,
      "TELEPHONY_NOT_CONFIGURED",
      "Phone numbers need TELNYX_API_KEY in the server environment.",
    );
  }

  const url = new URL(`${TELNYX_API}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${env.telnyxApiKey}`,
        "Content-Type": "application/json",
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new TelnyxError("Telnyx did not respond in time.", 504);
    }
    throw new TelnyxError("Could not reach Telnyx.", 502);
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new TelnyxError(
      describe(parsed, "Telnyx rejected the request."),
      response.status,
    );
  }
  return parsed as T;
}

export function telnyxConfigured(): boolean {
  return Boolean(env.telnyxApiKey);
}

interface AvailableNumberRow {
  phone_number?: string;
  region_information?: { region_type?: string; region_name?: string }[];
  cost_information?: {
    monthly_cost?: string;
    upfront_cost?: string;
    currency?: string;
  };
}

function readRegion(row: AvailableNumberRow, type: string): string | null {
  const match = row.region_information?.find((info) => info.region_type === type);
  return match?.region_name?.trim() || null;
}

/**
 * Telnyx quotes money to five decimal places ("1.00000"). Rendered raw that
 * reads as a bug next to a price, so it is trimmed to the two places a customer
 * expects — keeping the string form, because these are prices and not values to
 * do arithmetic on.
 */
function money(raw: string | undefined): string | null {
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : raw;
}

/**
 * Voice-capable numbers available to buy. `areaCode` maps to Telnyx's national
 * destination code, which is the filter customers actually think in ("give me
 * a 415 number").
 */
export async function searchAvailableNumbers(input: {
  countryCode: string;
  areaCode?: string;
  contains?: string;
  limit?: number;
}): Promise<AvailableNumber[]> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const body = await telnyxRequest<{ data?: AvailableNumberRow[] }>(
    "/available_phone_numbers",
    {
      query: {
        "filter[country_code]": input.countryCode.toUpperCase(),
        "filter[national_destination_code]": input.areaCode || undefined,
        "filter[phone_number][contains]": input.contains || undefined,
        "filter[features][]": "voice",
        "filter[limit]": limit,
      },
    },
  );

  return (body.data ?? [])
    .filter((row): row is AvailableNumberRow & { phone_number: string } =>
      Boolean(row.phone_number),
    )
    .map((row) => ({
      e164: row.phone_number,
      // Telnyx returns `location` and `rate_center` for US local numbers and
      // `locality` elsewhere; take whichever names the place.
      locality:
        readRegion(row, "locality") ??
        readRegion(row, "location") ??
        readRegion(row, "rate_center"),
      region: readRegion(row, "state") ?? readRegion(row, "province"),
      countryCode: readRegion(row, "country_code") ?? input.countryCode.toUpperCase(),
      monthlyCost: money(row.cost_information?.monthly_cost),
      upfrontCost: money(row.cost_information?.upfront_cost),
      currency: row.cost_information?.currency ?? null,
    }));
}

/**
 * Orders a number onto our account. Telnyx accepts the order before the number
 * is fully provisioned, so a `pending` order is not an error — the caller
 * confirms ownership with `findOwnedNumber` before charging ahead.
 */
export async function purchaseNumber(e164: string): Promise<void> {
  const body = await telnyxRequest<{
    data?: {
      status?: string;
      phone_numbers?: { phone_number?: string; status?: string }[];
    };
  }>("/number_orders", {
    method: "POST",
    body: {
      phone_numbers: [{ phone_number: e164 }],
      ...(env.telnyxConnectionId ? { connection_id: env.telnyxConnectionId } : {}),
    },
  });

  const line = body.data?.phone_numbers?.find(
    (entry) => entry.phone_number === e164,
  );
  if (line?.status && ["failure", "failed"].includes(line.status.toLowerCase())) {
    throw new TelnyxError(
      "Telnyx could not complete the order for that number.",
      502,
    );
  }
}

/** The number as our account sees it, or null when we do not own it. */
export async function findOwnedNumber(e164: string): Promise<OwnedNumber | null> {
  const body = await telnyxRequest<{
    data?: { id?: string; phone_number?: string; status?: string }[];
  }>("/phone_numbers", {
    query: { "filter[phone_number]": e164 },
  });

  const row = (body.data ?? []).find((entry) => entry.phone_number === e164);
  if (!row?.id) return null;
  return {
    id: row.id,
    e164: row.phone_number ?? e164,
    status: row.status ?? "unknown",
  };
}

/**
 * Hands the number back so the rental stops. Treated as done when we no longer
 * own it — releasing twice must not strand the caller's own cleanup.
 */
export async function releaseOwnedNumber(e164: string): Promise<void> {
  const owned = await findOwnedNumber(e164);
  if (!owned) return;
  try {
    await telnyxRequest(`/phone_numbers/${owned.id}`, { method: "DELETE" });
  } catch (error) {
    if (error instanceof TelnyxError && error.status === 404) return;
    throw error;
  }
}
