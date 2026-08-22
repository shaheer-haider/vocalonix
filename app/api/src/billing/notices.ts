/**
 * The emails that tell an owner their minutes are running out.
 *
 * Without these the product contradicts its own promise: the agent is sold as
 * the thing that stops you missing calls, and the enforcement in `usage.ts`
 * silently stops it answering the moment the allowance is spent. An owner who
 * spent 500 minutes on the 20th had a receptionist that went quiet for eleven
 * days and no way to find out except by logging in.
 *
 * Kept apart from `usage.ts` so the measurement stays free of templates, and
 * separate from `auth/email.ts` because these are product mail rather than
 * credentials — the two get different scrutiny when a sender is misconfigured.
 */

import { eq } from "drizzle-orm";

import { sendEmail } from "../auth/email";
import { db } from "../db/client";
import { users } from "../db/schema";
import { env } from "../env";
import { businessesForAccount, type BillingAccount } from "./account";
import type { Plan } from "./plans";

/**
 * Where to send somebody who wants to act on the mail. An account can own
 * several businesses but buys one subscription, so any of them reaches the
 * same billing panel; the hub is the honest fallback when it owns none yet.
 */
async function billingLink(accountId: string): Promise<string> {
  const owned = await businessesForAccount(accountId).catch(() => []);
  const path = owned[0] ? `/app/${owned[0].slug}/account` : "/app";
  return new URL(path, env.appOrigin).toString();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "2,000", not "2000" — the same form the pricing card uses. */
function minutes(value: number): string {
  return value.toLocaleString("en-US");
}

/**
 * Where the agent went quiet. Free answers on the website only, so telling a
 * Free account that its phone number has stopped answering describes a number
 * it was never sold.
 */
function channels(plan: Plan): string {
  return plan.phoneNumber
    ? "on your website and on your phone number"
    : "on your website";
}

interface NoticeCopy {
  subject: string;
  lines: string[];
  action: string;
}

function approachingCopy(
  plan: Plan,
  minutesUsed: number,
  greeting: string,
): NoticeCopy {
  return {
    subject: `Harkbell: ${minutes(minutesUsed)} of your ${minutes(plan.monthlyMinutes)} minutes are used`,
    lines: [
      greeting,
      `Your agent has answered ${minutes(minutesUsed)} of the ${minutes(plan.monthlyMinutes)} minutes included on ${plan.name}.`,
      `When the allowance is spent the agent stops answering ${channels(plan)}, until the period rolls over or you move up a plan.`,
      "Nothing is charged automatically. Moving up a plan is the only thing that adds minutes.",
    ],
    action: "Review your usage",
  };
}

function exhaustedCopy(
  plan: Plan,
  minutesUsed: number,
  greeting: string,
): NoticeCopy {
  return {
    subject: "Your Harkbell agent has stopped answering",
    lines: [
      greeting,
      `Your agent has used all ${minutes(plan.monthlyMinutes)} minutes included on ${plan.name} and has stopped answering ${channels(plan)}.`,
      "Callers will not reach it until the period rolls over or you move up a plan. Moving up brings it back on straight away.",
      `Minutes answered this period: ${minutes(minutesUsed)}.`,
    ],
    action: "Move up a plan",
  };
}

/**
 * Never throws. A mail that cannot be built or sent must not roll back the
 * enforcement it accompanies, and the level has already been recorded by the
 * caller — the alternative, notifying before recording, sends the same warning
 * on every worker sweep the moment a write fails.
 */
export async function sendUsageNotice(input: {
  account: BillingAccount;
  plan: Plan;
  minutesUsed: number;
  level: 80 | 100;
}): Promise<void> {
  try {
    const [owner] = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, input.account.ownerUserId))
      .limit(1);

    if (!owner?.email) {
      console.error(
        `Usage notice skipped for account ${input.account.id}: owner has no email.`,
      );
      return;
    }

    const firstName = owner.name.trim().split(/\s+/)[0] ?? "";
    const greeting = firstName ? `Hi ${firstName},` : "Hi,";
    const copy =
      input.level === 100
        ? exhaustedCopy(input.plan, input.minutesUsed, greeting)
        : approachingCopy(input.plan, input.minutesUsed, greeting);
    const link = await billingLink(input.account.id);

    await sendEmail({
      to: owner.email,
      subject: copy.subject,
      text: `${copy.lines.join("\n\n")}\n\n${copy.action}: ${link}`,
      html: [
        ...copy.lines.map((line) => `<p>${escapeHtml(line)}</p>`),
        `<p><a href="${escapeHtml(link)}">${escapeHtml(copy.action)}</a></p>`,
      ].join(""),
    });
  } catch (caught) {
    console.error(
      `Usage notice failed for account ${input.account.id}:`,
      caught,
    );
  }
}
