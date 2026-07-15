import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";

import { db } from "../db/client";
import { magicLinkRequests } from "../db/schema";
import { env } from "../env";

interface AuthLinkCapture {
  magicLink?: string;
  verificationLink?: string;
}

const authLinkCapture = new AsyncLocalStorage<AuthLinkCapture>();

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashAuthToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function captureAuthLinks<T>(
  operation: () => Promise<T>,
): Promise<{ result: T; links: AuthLinkCapture }> {
  const links: AuthLinkCapture = {};
  const result = await authLinkCapture.run(links, operation);
  return { result, links };
}

async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  if (!env.resendApiKey) return;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  if (!response.ok) {
    throw new Error(`Email provider rejected the request (${response.status}).`);
  }
}

export async function deliverMagicLink(input: {
  email: string;
  token: string;
}): Promise<void> {
  const email = normalizeEmail(input.email);
  const url = new URL("/magic", env.appOrigin);
  url.searchParams.set("token", input.token);

  await db.insert(magicLinkRequests).values({
    id: randomUUID(),
    tokenHash: hashAuthToken(input.token),
    email,
    expiresAt: new Date(Date.now() + env.magicLinkTtlSeconds * 1000),
  });

  const link = url.toString();
  const capture = authLinkCapture.getStore();
  if (capture) capture.magicLink = link;

  await sendEmail({
    to: email,
    subject: "Sign in to Vocalonix",
    text: `Sign in to Vocalonix: ${link}`,
    html: `<p>Sign in to Vocalonix:</p><p><a href="${link}">Continue to Vocalonix</a></p>`,
  });
}

export async function deliverVerificationLink(input: {
  email: string;
  token: string;
}): Promise<void> {
  const email = normalizeEmail(input.email);
  const url = new URL("/verify-email", env.appOrigin);
  url.searchParams.set("token", input.token);

  const link = url.toString();
  const capture = authLinkCapture.getStore();
  if (capture) capture.verificationLink = link;

  await sendEmail({
    to: email,
    subject: "Verify your Vocalonix email",
    text: `Verify your Vocalonix email: ${link}`,
    html: `<p>Verify your Vocalonix email:</p><p><a href="${link}">Verify email</a></p>`,
  });
}
