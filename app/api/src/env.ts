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
  APP_ORIGIN: process.env.APP_ORIGIN ?? "http://localhost:3000",
  REQUIRE_EMAIL_VERIFICATION:
    process.env.REQUIRE_EMAIL_VERIFICATION ?? (isProduction ? "true" : "false"),
  RESEND_API_KEY: process.env.RESEND_API_KEY?.trim() || undefined,
  EMAIL_FROM:
    process.env.EMAIL_FROM?.trim() || "Vocalonix <hello@vocalonix.ai>",
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
    process.env.DOGRAH_SERVICE_EMAIL ?? "vocalonix@vocalonix.ai",
  DOGRAH_SERVICE_PASSWORD:
    process.env.DOGRAH_SERVICE_PASSWORD ?? "change-me-vocalonix",
  DOGRAH_SERVICE_NAME: process.env.DOGRAH_SERVICE_NAME ?? "Vocalonix",
  DOGRAH_WORKFLOW_NAME:
    process.env.DOGRAH_WORKFLOW_NAME ?? "Vocalonix Agent",
  DOGRAH_WIDGET_ALLOWED_DOMAINS:
    process.env.DOGRAH_WIDGET_ALLOWED_DOMAINS ?? "localhost,127.0.0.1",
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
};
