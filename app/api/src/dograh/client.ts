import { env } from "../env";
import type {
  DograhDocumentList,
  DograhEmbedToken,
  DograhUpload,
  DograhWorkflow,
  DograhWorkflowSummary,
} from "./types";

const REQUEST_TIMEOUT_MS = 30_000;

export class DograhError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DograhError";
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  authenticated?: boolean;
  retryAuth?: boolean;
}

interface AuthResponse {
  token: string;
}

function errorDetail(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "detail" in value) {
    const detail = (value as { detail: unknown }).detail;
    return typeof detail === "string" ? detail : JSON.stringify(detail);
  }
  return "Dograh request failed";
}

class DograhClient {
  private sessionToken: string | null = null;
  private authentication: Promise<string> | null = null;

  private async authenticate(): Promise<string> {
    if (env.dograhApiKey) return env.dograhApiKey;
    if (this.sessionToken) return this.sessionToken;
    if (this.authentication) return this.authentication;

    this.authentication = this.loginOrSignup();
    try {
      this.sessionToken = await this.authentication;
      return this.sessionToken;
    } finally {
      this.authentication = null;
    }
  }

  private async loginOrSignup(): Promise<string> {
    const login = await this.rawRequest<AuthResponse>("/auth/login", {
      method: "POST",
      authenticated: false,
      body: {
        email: env.dograhServiceEmail,
        password: env.dograhServicePassword,
      },
    }).catch((error: unknown) => {
      if (error instanceof DograhError && error.status === 401) return null;
      throw error;
    });

    if (login) return login.token;

    const signup = await this.rawRequest<AuthResponse>("/auth/signup", {
      method: "POST",
      authenticated: false,
      body: {
        email: env.dograhServiceEmail,
        password: env.dograhServicePassword,
        name: env.dograhServiceName,
      },
    }).catch((error: unknown) => {
      if (error instanceof DograhError && error.status === 409) return null;
      throw error;
    });

    if (signup) return signup.token;

    const retry = await this.rawRequest<AuthResponse>("/auth/login", {
      method: "POST",
      authenticated: false,
      body: {
        email: env.dograhServiceEmail,
        password: env.dograhServicePassword,
      },
    });
    return retry.token;
  }

  private async rawRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const authenticated = options.authenticated ?? true;
    const token = authenticated ? await this.authenticate() : null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${env.dograhInternalUrl}/api/v1${path}`, {
        method: options.method ?? "GET",
        headers: {
          ...(token
            ? env.dograhApiKey
              ? { "X-API-Key": token }
              : { Authorization: `Bearer ${token}` }
            : {}),
          ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "Dograh request timed out"
          : "Dograh is unreachable";
      throw new DograhError(message, 503);
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 401 && authenticated && !env.dograhApiKey && options.retryAuth !== false) {
      this.sessionToken = null;
      return this.rawRequest<T>(path, { ...options, retryAuth: false });
    }

    if (!response.ok) {
      let detail: unknown = null;
      try {
        detail = await response.json();
      } catch {
        detail = null;
      }
      throw new DograhError(errorDetail(detail), response.status);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  health(): Promise<Record<string, unknown>> {
    return this.rawRequest("/health", { authenticated: false });
  }

  listWorkflows(): Promise<DograhWorkflowSummary[]> {
    return this.rawRequest("/workflow/fetch");
  }

  getWorkflow(id: number): Promise<DograhWorkflow> {
    return this.rawRequest(`/workflow/fetch/${id}`);
  }

  createWorkflow(name: string, workflowDefinition: Record<string, unknown>): Promise<DograhWorkflow> {
    return this.rawRequest("/workflow/create/definition", {
      method: "POST",
      body: { name, workflow_definition: workflowDefinition },
    });
  }

  updateWorkflow(id: number, name: string, workflowDefinition: Record<string, unknown>): Promise<DograhWorkflow> {
    return this.rawRequest(`/workflow/${id}`, {
      method: "PUT",
      body: { name, workflow_definition: workflowDefinition },
    });
  }

  publishWorkflow(id: number): Promise<Record<string, unknown>> {
    return this.rawRequest(`/workflow/${id}/publish`, { method: "POST" });
  }

  listDocuments(): Promise<DograhDocumentList> {
    return this.rawRequest("/knowledge-base/documents?limit=100&offset=0");
  }

  requestUpload(filename: string, mimeType: string): Promise<DograhUpload> {
    return this.rawRequest("/knowledge-base/upload-url", {
      method: "POST",
      body: {
        filename,
        mime_type: mimeType,
        custom_metadata: { source: "vocalonix" },
      },
    });
  }

  processDocument(documentUuid: string, s3Key: string, retrievalMode: string): Promise<Record<string, unknown>> {
    return this.rawRequest("/knowledge-base/process-document", {
      method: "POST",
      body: {
        document_uuid: documentUuid,
        s3_key: s3Key,
        retrieval_mode: retrievalMode,
      },
    });
  }

  deleteDocument(documentUuid: string): Promise<Record<string, unknown>> {
    return this.rawRequest(`/knowledge-base/documents/${documentUuid}`, { method: "DELETE" });
  }

  getEmbedToken(workflowId: number): Promise<DograhEmbedToken | null> {
    return this.rawRequest(`/workflow/${workflowId}/embed-token`);
  }

  createEmbedToken(
    workflowId: number,
    settings: Record<string, unknown>,
  ): Promise<DograhEmbedToken> {
    return this.rawRequest(`/workflow/${workflowId}/embed-token`, {
      method: "POST",
      body: {
        allowed_domains: env.dograhWidgetAllowedDomains,
        settings,
        usage_limit: null,
        expires_in_days: null,
      },
    });
  }

  async uploadFile(uploadUrl: string, file: File): Promise<void> {
    const destination = new URL(uploadUrl);
    if (env.dograhStorageInternalUrl) {
      const internal = new URL(env.dograhStorageInternalUrl);
      destination.protocol = internal.protocol;
      destination.hostname = internal.hostname;
      destination.port = internal.port;
    }

    const response = await fetch(destination, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });

    if (!response.ok) {
      throw new DograhError("Failed to upload the document to Dograh storage", response.status);
    }
  }
}

export const dograh = new DograhClient();
