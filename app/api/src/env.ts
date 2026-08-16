import { createHash } from "node:crypto";

import { z } from "zod";

const developmentDatabaseUrl =
  "postgres://vocalonix:vocalonix@localhost:5433/vocalonix";
const developmentAuthSecret =
  "dev-only-vocalonix-auth-secret-change-before-production";
const nodeEnv = process.env.NODE_ENV ?? "development";
const isProduction = nodeEnv === "production";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    PORT: z.coerce.number().int().positive(),
    DATABASE_URL: z.string().min(1),
    AUTH_SECRET: z.string().min(32),
    API_PUBLIC_URL: z.url(),
    VOCALONIX_INTERNAL_URL: z.url(),
    APP_ORIGIN: z.string().min(1),
    REQUIRE_EMAIL_VERIFICATION: z.enum(["true", "false"]),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().min(1),
    MAGIC_LINK_TTL_SECONDS: z.coerce.number().int().min(60).max(3600),
    DOGRAH_INTERNAL_URL: z.url(),
    DOGRAH_PUBLIC_API_URL: z.url(),
    DOGRAH_WIDGET_URL: z.url(),
    DOGRAH_STORAGE_INTERNAL_URL: z.url().optional(),
    DOGRAH_API_KEY: z.string().optional(),
    DOGRAH_SERVICE_EMAIL: z.email(),
    DOGRAH_SERVICE_PASSWORD: z.string().min(1),
    DOGRAH_SERVICE_NAME: z.string().min(1),
    DOGRAH_WORKFLOW_NAME: z.string().min(1),
    DOGRAH_WIDGET_ALLOWED_DOMAINS: z.string().min(1),
    STRIPE_SECRET_KEY: z.string().optional(),
    MAX_OWNED_WORKSPACES: z.coerce.number().int().min(1).default(3),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_EXTRACTION_MODEL: z.string().min(1),
    VOICE_STACK: z.enum(["auto", "pipeline", "realtime"]),
    DEEPGRAM_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    ELEVENLABS_API_KEY: z.string().optional(),
    ELEVENLABS_VOICE_ID: z.string().optional(),
    CARTESIA_API_KEY: z.string().optional(),
    CARTESIA_VOICE_ID: z.string().optional(),
    VOICE_LLM_MODEL: z.string().min(1),
    VOICE_STT_MODEL: z.string().min(1),
    VOICE_LANGUAGE: z.string().min(1),
    VOICE_REALTIME_MODEL: z.string().min(1),
    TELNYX_API_KEY: z.string().optional(),
    TELNYX_CONNECTION_ID: z.string().optional(),
    TELNYX_WEBHOOK_PUBLIC_KEY: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (!isProduction) return;

    if (value.AUTH_SECRET === developmentAuthSecret) {
      context.addIssue({
        code: "custom",
        path: ["AUTH_SECRET"],
        message: "Production requires a unique AUTH_SECRET.",
      });
    }
    if (!value.RESEND_API_KEY) {
      context.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "Production requires RESEND_API_KEY.",
      });
    }
    if (!process.env.EMAIL_FROM?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["EMAIL_FROM"],
        message: "Production requires EMAIL_FROM.",
      });
    }
    if (!process.env.API_PUBLIC_URL?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["API_PUBLIC_URL"],
        message: "Production requires API_PUBLIC_URL.",
      });
    }
    if (!process.env.APP_ORIGIN?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["APP_ORIGIN"],
        message: "Production requires APP_ORIGIN.",
      });
    }
    if (new URL(value.API_PUBLIC_URL).protocol !== "https:") {
      context.addIssue({
        code: "custom",
        path: ["API_PUBLIC_URL"],
        message: "Production requires an HTTPS API_PUBLIC_URL.",
      });
    }
    for (const origin of value.APP_ORIGIN.split(",")) {
      try {
        if (new URL(origin.trim()).protocol !== "https:") {
          context.addIssue({
            code: "custom",
            path: ["APP_ORIGIN"],
            message: "Production requires HTTPS application origins.",
          });
        }
      } catch {
        context.addIssue({
          code: "custom",
          path: ["APP_ORIGIN"],
          message: "APP_ORIGIN contains an invalid origin.",
        });
      }
    }
    if (!value.EMAIL_FROM.includes("@")) {
      context.addIssue({
        code: "custom",
        path: ["EMAIL_FROM"],
        message: "EMAIL_FROM must contain a valid sender address.",
      });
    }
    if (
      !value.DOGRAH_API_KEY &&
      value.DOGRAH_SERVICE_PASSWORD === "change-me-vocalonix"
    ) {
      context.addIssue({
        code: "custom",
        path: ["DOGRAH_SERVICE_PASSWORD"],
        message:
          "Production requires DOGRAH_API_KEY or a unique service password.",
      });
    }
    if (value.REQUIRE_EMAIL_VERIFICATION !== "true") {
      context.addIssue({
        code: "custom",
        path: ["REQUIRE_EMAIL_VERIFICATION"],
        message: "Production requires email verification.",
      });
    }
  });

const parsed = schema.safeParse({
  NODE_ENV: nodeEnv,
  PORT: process.env.PORT ?? "3001",
  DATABASE_URL:
    process.env.DATABASE_URL ??
    (isProduction ? undefined : developmentDatabaseUrl),
  AUTH_SECRET:
    process.env.AUTH_SECRET ??
    (isProduction ? undefined : developmentAuthSecret),
  API_PUBLIC_URL: process.env.API_PUBLIC_URL ?? "http://localhost:3001",
  VOCALONIX_INTERNAL_URL:
    process.env.VOCALONIX_INTERNAL_URL?.trim() ||
    process.env.API_PUBLIC_URL ||
    "http://localhost:3001",
  APP_ORIGIN: process.env.APP_ORIGIN ?? "http://localhost:3000",
  REQUIRE_EMAIL_VERIFICATION:
    process.env.REQUIRE_EMAIL_VERIFICATION ?? (isProduction ? "true" : "false"),
  RESEND_API_KEY: process.env.RESEND_API_KEY?.trim() || undefined,
  EMAIL_FROM:
    process.env.EMAIL_FROM?.trim() || "Harkbell <hello@harkbell.com>",
  MAGIC_LINK_TTL_SECONDS: process.env.MAGIC_LINK_TTL_SECONDS ?? "900",
  DOGRAH_INTERNAL_URL:
    process.env.DOGRAH_INTERNAL_URL ?? "http://localhost:8000",
  DOGRAH_PUBLIC_API_URL:
    process.env.DOGRAH_PUBLIC_API_URL ?? "http://localhost:8000",
  DOGRAH_WIDGET_URL:
    process.env.DOGRAH_WIDGET_URL ?? "http://localhost:3000",
  DOGRAH_STORAGE_INTERNAL_URL:
    process.env.DOGRAH_STORAGE_INTERNAL_URL?.trim() || undefined,
  DOGRAH_API_KEY: process.env.DOGRAH_API_KEY?.trim() || undefined,
  DOGRAH_SERVICE_EMAIL:
    process.env.DOGRAH_SERVICE_EMAIL ?? "harkbell@harkbell.com",
  DOGRAH_SERVICE_PASSWORD:
    process.env.DOGRAH_SERVICE_PASSWORD ?? "change-me-vocalonix",
  DOGRAH_SERVICE_NAME: process.env.DOGRAH_SERVICE_NAME ?? "Harkbell",
  DOGRAH_WORKFLOW_NAME:
    process.env.DOGRAH_WORKFLOW_NAME ?? "Harkbell Agent",
  DOGRAH_WIDGET_ALLOWED_DOMAINS:
    process.env.DOGRAH_WIDGET_ALLOWED_DOMAINS ?? "localhost,127.0.0.1",
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY?.trim() || undefined,
  MAX_OWNED_WORKSPACES: process.env.MAX_OWNED_WORKSPACES ?? "3",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY?.trim() || undefined,
  GEMINI_EXTRACTION_MODEL:
    process.env.GEMINI_EXTRACTION_MODEL?.trim() || "gemini-flash-latest",
  VOICE_STACK: process.env.VOICE_STACK?.trim() || "auto",
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY?.trim() || undefined,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY?.trim() || undefined,
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY?.trim() || undefined,
  ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID?.trim() || undefined,
  CARTESIA_API_KEY: process.env.CARTESIA_API_KEY?.trim() || undefined,
  CARTESIA_VOICE_ID: process.env.CARTESIA_VOICE_ID?.trim() || undefined,
  VOICE_LLM_MODEL: process.env.VOICE_LLM_MODEL?.trim() || "gpt-4.1-mini",
  VOICE_STT_MODEL: process.env.VOICE_STT_MODEL?.trim() || "nova-3-general",
  VOICE_LANGUAGE: process.env.VOICE_LANGUAGE?.trim() || "multi",
  VOICE_REALTIME_MODEL:
    process.env.VOICE_REALTIME_MODEL?.trim() || "gemini-3.1-flash-live-preview",
  TELNYX_API_KEY: process.env.TELNYX_API_KEY?.trim() || undefined,
  TELNYX_CONNECTION_ID: process.env.TELNYX_CONNECTION_ID?.trim() || undefined,
  TELNYX_WEBHOOK_PUBLIC_KEY:
    process.env.TELNYX_WEBHOOK_PUBLIC_KEY?.trim() || undefined,
});

if (!parsed.success) {
  console.error("Invalid environment", parsed.error.flatten().fieldErrors);
  throw new Error("Refusing to boot until the environment is valid.");
}

function trimUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseOrigins(value: string): string[] {
  const origins = value
    .split(",")
    .map((origin) => trimUrl(origin.trim()))
    .filter(Boolean);

  for (const origin of origins) {
    new URL(origin);
  }
  if (origins.length === 0) {
    throw new Error("APP_ORIGIN must contain at least one origin.");
  }

  return origins;
}

const appOrigins = parseOrigins(parsed.data.APP_ORIGIN);

export const env = {
  nodeEnv: parsed.data.NODE_ENV,
  isProduction,
  port: parsed.data.PORT,
  databaseUrl: parsed.data.DATABASE_URL,
  authSecret: parsed.data.AUTH_SECRET,
  apiPublicUrl: trimUrl(parsed.data.API_PUBLIC_URL),
  vocalonixInternalUrl: trimUrl(parsed.data.VOCALONIX_INTERNAL_URL),
  agentToolSecret: createHash("sha256")
    .update(`vocalonix-agent-tools:${parsed.data.AUTH_SECRET}`)
    .digest("hex"),
  appOrigins,
  appOrigin: appOrigins[0]!,
  requireEmailVerification:
    parsed.data.REQUIRE_EMAIL_VERIFICATION === "true",
  resendApiKey: parsed.data.RESEND_API_KEY ?? null,
  emailFrom: parsed.data.EMAIL_FROM,
  magicLinkTtlSeconds: parsed.data.MAGIC_LINK_TTL_SECONDS,
  dograhInternalUrl: trimUrl(parsed.data.DOGRAH_INTERNAL_URL),
  dograhPublicApiUrl: trimUrl(parsed.data.DOGRAH_PUBLIC_API_URL),
  dograhWidgetUrl: trimUrl(parsed.data.DOGRAH_WIDGET_URL),
  dograhStorageInternalUrl: parsed.data.DOGRAH_STORAGE_INTERNAL_URL
    ? trimUrl(parsed.data.DOGRAH_STORAGE_INTERNAL_URL)
    : null,
  dograhApiKey: parsed.data.DOGRAH_API_KEY ?? null,
  dograhServiceEmail: parsed.data.DOGRAH_SERVICE_EMAIL,
  dograhServicePassword: parsed.data.DOGRAH_SERVICE_PASSWORD,
  dograhServiceName: parsed.data.DOGRAH_SERVICE_NAME,
  dograhWorkflowName: parsed.data.DOGRAH_WORKFLOW_NAME,
  dograhWidgetAllowedDomains:
    parsed.data.DOGRAH_WIDGET_ALLOWED_DOMAINS.split(",")
      .map((domain) => domain.trim())
      .filter(Boolean),
  stripeSecretKey: parsed.data.STRIPE_SECRET_KEY ?? null,
  maxOwnedWorkspaces: parsed.data.MAX_OWNED_WORKSPACES,
  geminiApiKey: parsed.data.GEMINI_API_KEY ?? null,
  geminiExtractionModel: parsed.data.GEMINI_EXTRACTION_MODEL,
  voiceStack: parsed.data.VOICE_STACK,
  deepgramApiKey: parsed.data.DEEPGRAM_API_KEY ?? null,
  openaiApiKey: parsed.data.OPENAI_API_KEY ?? null,
  elevenlabsApiKey: parsed.data.ELEVENLABS_API_KEY ?? null,
  elevenlabsVoiceId: parsed.data.ELEVENLABS_VOICE_ID ?? null,
  cartesiaApiKey: parsed.data.CARTESIA_API_KEY ?? null,
  cartesiaVoiceId: parsed.data.CARTESIA_VOICE_ID ?? null,
  voiceLlmModel: parsed.data.VOICE_LLM_MODEL,
  voiceSttModel: parsed.data.VOICE_STT_MODEL,
  voiceLanguage: parsed.data.VOICE_LANGUAGE,
  voiceRealtimeModel: parsed.data.VOICE_REALTIME_MODEL,
  telnyxApiKey: parsed.data.TELNYX_API_KEY ?? null,
  telnyxConnectionId: parsed.data.TELNYX_CONNECTION_ID ?? null,
  telnyxWebhookPublicKey: parsed.data.TELNYX_WEBHOOK_PUBLIC_KEY ?? null,
};
