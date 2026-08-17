import { describe, expect, test } from "bun:test";

import { tenantDograhCredentials } from "./tenantAccount";

describe("tenantDograhCredentials", () => {
  test("are stable for a business across calls", () => {
    // Nothing stores these. If they were not reproducible, a restart would
    // lock every business out of its own Dograh organization.
    const first = tenantDograhCredentials("business-a");
    const second = tenantDograhCredentials("business-a");
    expect(first).toEqual(second);
  });

  test("two businesses never share an account", () => {
    const a = tenantDograhCredentials("business-a");
    const b = tenantDograhCredentials("business-b");
    expect(a.email).not.toBe(b.email);
    expect(a.password).not.toBe(b.password);
  });

  test("the business name does not change the login", () => {
    // Renaming a workspace must not orphan its organization on the engine, so
    // only the id may feed the email and password.
    const before = tenantDograhCredentials("business-a", "Willow & Co");
    const after = tenantDograhCredentials("business-a", "Something Else Ltd");
    expect(after.email).toBe(before.email);
    expect(after.password).toBe(before.password);
    expect(after.name).not.toBe(before.name);
  });

  test("the email is one Dograh's validator will accept", () => {
    // Dograh runs a real address validator on signup and rejects reserved
    // suffixes such as .local and .test outright, which is a 422 at
    // provisioning time rather than anything visible later.
    const { email } = tenantDograhCredentials("business-a");
    expect(email).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i);
    expect(email).not.toMatch(/\.(local|test|invalid|example|localhost)$/i);
  });

  test("the password is long and free of characters that need escaping", () => {
    const { password } = tenantDograhCredentials("business-a");
    expect(password.length).toBeGreaterThanOrEqual(32);
    // base64url, so it survives JSON and any form encoding untouched.
    expect(password).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test("the display name carries the business, for a readable engine dashboard", () => {
    expect(tenantDograhCredentials("business-a", "Willow & Co").name).toContain(
      "Willow & Co",
    );
  });
});
