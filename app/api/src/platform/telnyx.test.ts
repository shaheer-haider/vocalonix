import { afterEach, describe, expect, test } from "bun:test";

import { env } from "../env";
import {
  bindNumberToConnection,
  fetchWebhookPublicKey,
  findOwnedNumber,
  releaseOwnedNumber,
  searchAvailableNumbers,
  TelnyxError,
} from "./telnyx";

const realFetch = globalThis.fetch;
const realKey = env.telnyxApiKey;

afterEach(() => {
  globalThis.fetch = realFetch;
  (env as { telnyxApiKey: string | null }).telnyxApiKey = realKey;
});

function stubFetch(handler: (url: URL, init: RequestInit) => Response) {
  const calls: { url: URL; init: RequestInit }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = input instanceof URL ? input : new URL(String(input));
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return calls;
}

function withKey() {
  (env as { telnyxApiKey: string | null }).telnyxApiKey = "KEY-test";
}

describe("number search", () => {
  test("asks only for voice-capable numbers and passes the area code through", async () => {
    withKey();
    const calls = stubFetch(
      () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );

    await searchAvailableNumbers({ countryCode: "us", areaCode: "415" });

    const query = calls[0]!.url.searchParams;
    expect(query.get("filter[country_code]")).toBe("US");
    expect(query.get("filter[national_destination_code]")).toBe("415");
    // Without this filter Telnyx happily sells SMS-only numbers, which accept
    // the order and then never ring.
    expect(query.get("filter[features][]")).toBe("voice");
  });

  test("omits blank filters rather than sending empty ones", async () => {
    withKey();
    const calls = stubFetch(
      () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );

    await searchAvailableNumbers({ countryCode: "US", areaCode: "", contains: "" });

    const query = calls[0]!.url.searchParams;
    expect(query.has("filter[national_destination_code]")).toBe(false);
    expect(query.has("filter[phone_number][contains]")).toBe(false);
  });

  test("flattens the region and cost a customer needs to choose", async () => {
    withKey();
    stubFetch(
      () =>
        new Response(
          JSON.stringify({
            data: [
              {
                phone_number: "+14155550123",
                // The shape Telnyx actually returns for a US local number:
                // no `locality`, and money to five decimal places.
                region_information: [
                  { region_type: "country_code", region_name: "US" },
                  { region_type: "state", region_name: "CA" },
                  { region_type: "rate_center", region_name: "POINT REYES" },
                  { region_type: "location", region_name: "San Francisco" },
                ],
                cost_information: {
                  monthly_cost: "1.00000",
                  upfront_cost: "0.40000",
                  currency: "USD",
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );

    const [number] = await searchAvailableNumbers({ countryCode: "US" });

    expect(number).toEqual({
      e164: "+14155550123",
      locality: "San Francisco",
      region: "CA",
      countryCode: "US",
      monthlyCost: "1.00",
      upfrontCost: "0.40",
      currency: "USD",
    });
  });

  test("surfaces the provider's own wording on rejection", async () => {
    withKey();
    stubFetch(
      () =>
        new Response(
          JSON.stringify({
            errors: [{ detail: "This number is no longer available." }],
          }),
          { status: 422 },
        ),
    );

    await expect(searchAvailableNumbers({ countryCode: "US" })).rejects.toThrow(
      "This number is no longer available.",
    );
  });

  test("refuses to call the provider with no key configured", async () => {
    (env as { telnyxApiKey: string | null }).telnyxApiKey = null;
    let called = false;
    stubFetch(() => {
      called = true;
      return new Response("{}", { status: 200 });
    });

    await expect(searchAvailableNumbers({ countryCode: "US" })).rejects.toThrow(
      /TELNYX_API_KEY/,
    );
    expect(called).toBe(false);
  });
});

describe("releasing a number", () => {
  test("does nothing when the account does not own it", async () => {
    withKey();
    const calls = stubFetch(
      () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );

    await releaseOwnedNumber("+14155550123");

    // Lookup only — no DELETE against a number that is not ours.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.init.method ?? "GET").toBe("GET");
  });

  test("deletes by provider id once ownership is confirmed", async () => {
    withKey();
    const calls = stubFetch((url) => {
      if (url.pathname.endsWith("/phone_numbers")) {
        return new Response(
          JSON.stringify({
            data: [{ id: "987", phone_number: "+14155550123", status: "active" }],
          }),
          { status: 200 },
        );
      }
      return new Response("", { status: 204 });
    });

    await releaseOwnedNumber("+14155550123");

    expect(calls).toHaveLength(2);
    expect(calls[1]!.url.pathname).toBe("/v2/phone_numbers/987");
    expect(calls[1]!.init.method).toBe("DELETE");
  });

  test("treats an already-deleted number as released", async () => {
    withKey();
    stubFetch((url) => {
      if (url.pathname.endsWith("/phone_numbers")) {
        return new Response(
          JSON.stringify({
            data: [{ id: "987", phone_number: "+14155550123" }],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ errors: [{ detail: "gone" }] }), {
        status: 404,
      });
    });

    // A 404 on delete means the rental is already stopped, which is the goal.
    await expect(releaseOwnedNumber("+14155550123")).resolves.toBeUndefined();
  });

  test("propagates a real provider failure", async () => {
    withKey();
    stubFetch((url) => {
      if (url.pathname.endsWith("/phone_numbers")) {
        return new Response(
          JSON.stringify({ data: [{ id: "987", phone_number: "+14155550123" }] }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ errors: [{ detail: "locked" }] }), {
        status: 500,
      });
    });

    await expect(releaseOwnedNumber("+14155550123")).rejects.toBeInstanceOf(
      TelnyxError,
    );
  });
});

describe("connection binding", () => {
  test("reports an unbound number as bound to nothing", async () => {
    withKey();
    // Telnyx sends "" rather than omitting the field, and "" is exactly the
    // state where a number is owned, billed, and silent.
    stubFetch(
      () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: "987",
                phone_number: "+14155550123",
                status: "active",
                connection_id: "",
              },
            ],
          }),
          { status: 200 },
        ),
    );

    const owned = await findOwnedNumber("+14155550123");

    expect(owned?.status).toBe("active");
    expect(owned?.connectionId).toBeNull();
  });

  test("surfaces the application a bound number delivers to", async () => {
    withKey();
    stubFetch(
      () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: "987",
                phone_number: "+14155550123",
                status: "active",
                connection_id: "3027614532156523665",
              },
            ],
          }),
          { status: 200 },
        ),
    );

    const owned = await findOwnedNumber("+14155550123");

    expect(owned?.connectionId).toBe("3027614532156523665");
  });

  test("binds by provider id, not by phone number", async () => {
    withKey();
    const calls = stubFetch(() => new Response(JSON.stringify({ data: {} })));

    await bindNumberToConnection("987", "3027614532156523665");

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url.pathname).toBe("/v2/phone_numbers/987");
    expect(calls[0]!.init.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      connection_id: "3027614532156523665",
    });
  });

  test("a rejected binding is an error rather than a silent no-op", async () => {
    withKey();
    stubFetch(
      () =>
        new Response(
          JSON.stringify({ errors: [{ detail: "Connection not found" }] }),
          { status: 422 },
        ),
    );

    await expect(
      bindNumberToConnection("987", "missing"),
    ).rejects.toThrow("Connection not found");
  });
});

describe("webhook public key", () => {
  test("reads the account signing key Dograh needs to accept webhooks", async () => {
    withKey();
    const calls = stubFetch(
      () =>
        new Response(
          JSON.stringify({ data: { public: "7xOpTqBUyWNkycDW==", record_type: "public_key" } }),
          { status: 200 },
        ),
    );

    await expect(fetchWebhookPublicKey()).resolves.toBe("7xOpTqBUyWNkycDW==");
    expect(calls[0]!.url.pathname).toBe("/v2/public_key");
  });

  test("returns null when the account has no key, rather than an empty string", async () => {
    withKey();
    stubFetch(
      () => new Response(JSON.stringify({ data: { public: "  " } }), { status: 200 }),
    );

    // An empty key must not be written into the configuration as if it were
    // real: Dograh would accept it and reject every inbound webhook.
    await expect(fetchWebhookPublicKey()).resolves.toBeNull();
  });
});
