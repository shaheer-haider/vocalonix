/**
 * A Dograh account per business.
 *
 * Every business shares one Dograh organization today, and Dograh scopes
 * knowledge retrieval by `organization_id`. Nothing leaks right now only
 * because the workflow generator pins `document_uuids` on every node that can
 * retrieve — a property asserted in `config.test.ts`, but still one forgotten
 * node away from one business answering out of another's documents. Giving each
 * business its own organization makes the engine enforce the boundary instead
 * of the generator remembering to.
 *
 * Credentials are derived, not stored. A password column would be a secret at
 * rest that buys nothing: Harkbell already holds `AUTH_SECRET`, and anything
 * able to read that can reach the platform account anyway. This mirrors how the
 * agent-tools key is derived in `env.ts`.
 */

import { createHmac } from "node:crypto";

import { pushModelConfigurationTo } from "../platform/providers";
import { env } from "../env";
import {
  forgetTenantDograhClient,
  tenantDograhClient,
  type DograhManagementClient,
} from "./client";

export interface TenantDograhCredentials {
  email: string;
  password: string;
  name: string;
}

/**
 * The domain tenant logins sit on, taken from the platform service account so
 * a deployment never has to configure a second one. Dograh only ever validates
 * that these look like email addresses; no mail is sent to them.
 */
function tenantEmailDomain(): string {
  const at = env.dograhServiceEmail.lastIndexOf("@");
  const domain = at === -1 ? "" : env.dograhServiceEmail.slice(at + 1).trim();
  // Dograh validates signup emails with a real address validator, which rejects
  // reserved suffixes like `.local` and `.test` outright. The fallback has to
  // be a normal-looking domain or every tenant account fails to provision.
  return domain || "harkbell.com";
}

/**
 * Deterministic per-business credentials.
 *
 * Deterministic because the alternative is storing a password: a business's
 * account has to be reachable on every boot, from any API instance, without
 * coordination. The cost is that rotating `AUTH_SECRET` orphans every tenant
 * organization on the engine — the same caveat that already applies to the
 * agent-tools key, and the reason `AUTH_SECRET` is set once per deployment.
 */
export function tenantDograhCredentials(
  businessId: string,
  businessName?: string,
): TenantDograhCredentials {
  const password = createHmac("sha256", env.authSecret)
    .update(`dograh-tenant:${businessId}`)
    .digest("base64url");

  return {
    email: `tenant-${businessId}@${tenantEmailDomain()}`,
    // Dograh's signup takes whatever password it is given; length here is a
    // free win since no human ever types it.
    password,
    name: businessName?.trim()
      ? `${businessName.trim()} (Harkbell)`
      : `Harkbell tenant ${businessId}`,
  };
}

/**
 * Returns a Dograh client acting as this business, creating its organization on
 * the engine the first time it is asked for.
 *
 * There is no explicit "create account" call: the client signs up on its first
 * authentication and logs in on every one after, so provisioning is a
 * consequence of using it rather than a step that can be skipped or run twice.
 *
 * The provider keys have to be pushed into the new organization before it can
 * take a call — model configuration in Dograh is per-organization, and a fresh
 * one has none of ours. A failure to push is returned rather than thrown: the
 * business's own workflow still syncs, and the readiness panel is where a
 * missing key belongs.
 */
export async function tenantDograhAccount(
  businessId: string,
  businessName?: string,
): Promise<{ client: DograhManagementClient; providerError: string | null }> {
  const credentials = tenantDograhCredentials(businessId, businessName);
  const client = tenantDograhClient(businessId, credentials);
  const providerError = await pushModelConfigurationTo(client);
  if (providerError) {
    console.error(
      `Provider configuration push failed for business ${businessId}: ${providerError}`,
    );
  }
  return { client, providerError };
}

/** Drops the cached session for a business that is being torn down. */
export function releaseTenantDograhAccount(businessId: string): void {
  forgetTenantDograhClient(businessId);
}
