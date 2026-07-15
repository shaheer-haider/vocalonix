import { DograhError } from "./client";

export type DograhFailureCategory =
  | "unreachable"
  | "unauthorized"
  | "not_found"
  | "rejected"
  | "unknown";

export interface ClassifiedDograhFailure {
  category: DograhFailureCategory;
  message: string;
  retryable: boolean;
}

function sanitizedDetail(message: string): string {
  return message
    .replaceAll(/https?:\/\/\S+/gi, "[remote service]")
    .replaceAll(/(?:bearer|api[_ -]?key|password|token)\s*[:=]\s*\S+/gi, "[credential removed]")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

export function classifyDograhFailure(error: unknown): ClassifiedDograhFailure {
  if (!(error instanceof DograhError)) {
    return {
      category: "unknown",
      message: "Dograh synchronization failed unexpectedly. Retry or contact support.",
      retryable: true,
    };
  }

  if (error.status === 401 || error.status === 403) {
    return {
      category: "unauthorized",
      message: "Dograh rejected the server credentials. Check the server-side integration.",
      retryable: false,
    };
  }
  if (error.status === 404) {
    return {
      category: "not_found",
      message: "The mapped Dograh resource no longer exists. Retry to reconcile it.",
      retryable: false,
    };
  }
  if (error.status === 408 || error.status === 429 || error.status >= 500) {
    return {
      category: "unreachable",
      message: "Dograh is temporarily unavailable. Vocalonix saved the local changes and will retry.",
      retryable: true,
    };
  }
  if (error.status >= 400 && error.status < 500) {
    const detail = sanitizedDetail(error.message);
    return {
      category: "rejected",
      message: detail
        ? `Dograh rejected this configuration: ${detail}`
        : "Dograh rejected this configuration. Review the saved values before retrying.",
      retryable: false,
    };
  }
  return {
    category: "unknown",
    message: "Dograh synchronization failed unexpectedly. Retry or contact support.",
    retryable: true,
  };
}
