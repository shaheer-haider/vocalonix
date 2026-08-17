/**
 * Resolving the account a subscription is bought against.
 *
 * One person, one account, many businesses. Everything that costs money is
 * decided here rather than on a business row, because the plan sells a number
 * of businesses and a business cannot be the thing that owns that allowance.
 */

import { randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db/client";
import { billingAccounts, businesses } from "../db/schema";
import { ApiError } from "../errors";

export type BillingAccount = typeof billingAccounts.$inferSelect;

/**
 * The account for a person, created on first use.
 *
 * `onConflictDoNothing` on the owner index rather than a read-then-write:
 * creating two businesses in quick succession would otherwise race and try to
 * insert two accounts for the same owner.
 */
export async function accountForUser(userId: string): Promise<BillingAccount> {
  const [existing] = await db
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.ownerUserId, userId))
    .limit(1);
  if (existing) return existing;

  await db
    .insert(billingAccounts)
    .values({ id: randomUUID(), ownerUserId: userId })
    .onConflictDoNothing({ target: billingAccounts.ownerUserId });

  const [created] = await db
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.ownerUserId, userId))
    .limit(1);
  if (!created) {
    throw new ApiError(
      500,
      "BILLING_ACCOUNT_UNAVAILABLE",
      "Your billing account could not be prepared. Try again shortly.",
    );
  }
  return created;
}

/**
 * The account paying for a business.
 *
 * Falls back to the creator's account when the link is missing, which is only
 * possible for rows that predate the column. Reading through to the owner
 * keeps those working instead of treating them as unbilled.
 */
export async function accountForBusiness(
  businessId: string,
): Promise<BillingAccount> {
  const [row] = await db
    .select({
      billingAccountId: businesses.billingAccountId,
      createdBy: businesses.createdBy,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!row) {
    throw new ApiError(404, "BUSINESS_NOT_FOUND", "That business was not found.");
  }

  if (row.billingAccountId) {
    const [account] = await db
      .select()
      .from(billingAccounts)
      .where(eq(billingAccounts.id, row.billingAccountId))
      .limit(1);
    if (account) return account;
  }

  const account = await accountForUser(row.createdBy);
  await db
    .update(businesses)
    .set({ billingAccountId: account.id, updatedAt: new Date() })
    .where(eq(businesses.id, businessId));
  return account;
}

/** Every live business the account pays for. */
export async function businessesForAccount(
  accountId: string,
): Promise<Array<{ id: string; slug: string; name: string }>> {
  return db
    .select({ id: businesses.id, slug: businesses.slug, name: businesses.name })
    .from(businesses)
    .where(
      and(
        eq(businesses.billingAccountId, accountId),
        isNull(businesses.deletedAt),
      ),
    );
}

export async function businessCountForAccount(
  accountId: string,
): Promise<number> {
  return (await businessesForAccount(accountId)).length;
}
