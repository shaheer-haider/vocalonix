import { randomUUID } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../db/client";
import { contacts } from "../db/schema";

export interface ContactDetails {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/** Digits-only form used to match phone numbers written differently. */
export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Find the contact a booking or callback belongs to, creating one when the
 * caller is new. Matches by phone first (digits-only), then email, then an
 * exact case-insensitive name. Fills in details the existing record is
 * missing so repeat callers accumulate a complete card.
 */
export async function linkContact(
  businessId: string,
  details: ContactDetails,
  source: "call" | "manual" | "import",
  createdBy: string | null = null,
): Promise<string | null> {
  const name = clean(details.name);
  const phone = clean(details.phone);
  const email = clean(details.email)?.toLowerCase() ?? null;
  if (!name && !phone && !email) return null;

  let existing: typeof contacts.$inferSelect | undefined;
  if (phone) {
    const digits = phoneDigits(phone);
    if (digits) {
      [existing] = await db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.businessId, businessId),
            isNull(contacts.deletedAt),
            sql`regexp_replace(coalesce(${contacts.phone}, ''), '\\D', '', 'g') = ${digits}`,
          ),
        )
        .limit(1);
    }
  }
  if (!existing && email) {
    [existing] = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.businessId, businessId),
          isNull(contacts.deletedAt),
          sql`lower(coalesce(${contacts.email}, '')) = ${email}`,
        ),
      )
      .limit(1);
  }
  if (!existing && name && !phone && !email) {
    [existing] = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.businessId, businessId),
          isNull(contacts.deletedAt),
          sql`lower(coalesce(${contacts.name}, '')) = ${name.toLowerCase()}`,
        ),
      )
      .limit(1);
  }

  if (existing) {
    const updates: Partial<typeof contacts.$inferInsert> = {};
    if (name && !existing.name) updates.name = name;
    if (phone && !existing.phone) updates.phone = phone;
    if (email && !existing.email) updates.email = email;
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      await db.update(contacts).set(updates).where(eq(contacts.id, existing.id));
    }
    return existing.id;
  }

  const id = randomUUID();
  await db.insert(contacts).values({
    id,
    businessId,
    name,
    phone,
    email,
    source,
    createdBy,
  });
  return id;
}
