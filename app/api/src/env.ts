function read(name: string, fallback?: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${name}`);
}

function trimUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export const env = {
  port: Number(read("PORT", "3001")),
  appOrigins: read("APP_ORIGIN", "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  dograhInternalUrl: trimUrl(read("DOGRAH_INTERNAL_URL", "http://localhost:8000")),
  dograhPublicApiUrl: trimUrl(read("DOGRAH_PUBLIC_API_URL", "http://localhost:8000")),
  dograhWidgetUrl: trimUrl(read("DOGRAH_WIDGET_URL", "http://localhost:3000")),
  dograhStorageInternalUrl: process.env.DOGRAH_STORAGE_INTERNAL_URL
    ? trimUrl(process.env.DOGRAH_STORAGE_INTERNAL_URL)
    : null,
  dograhApiKey: process.env.DOGRAH_API_KEY?.trim() || null,
  dograhServiceEmail: read("DOGRAH_SERVICE_EMAIL", "vocalonix@vocalonix.ai"),
  dograhServicePassword: read("DOGRAH_SERVICE_PASSWORD", "change-me-vocalonix"),
  dograhServiceName: read("DOGRAH_SERVICE_NAME", "Vocalonix"),
  dograhWorkflowName: read("DOGRAH_WORKFLOW_NAME", "Vocalonix Agent"),
  dograhWidgetAllowedDomains: read("DOGRAH_WIDGET_ALLOWED_DOMAINS", "localhost,127.0.0.1")
    .split(",")
    .map((domain) => domain.trim())
    .filter(Boolean),
};
