import { env } from "../env";
import type {
  DograhDocumentList,
  DograhDocument,
  DograhEmbedToken,
  DograhInitiatedCall,
  DograhModelConfiguration,
  DograhPhoneNumber,
  DograhTelephonyConfiguration,
  DograhTelephonyConfigurationDetail,
  DograhTool,
  DograhUpload,
  DograhWorkflow,
  DograhWorkflowRun,
  DograhWorkflowRunsPage,
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

/**
 * Model-configuration saves fail with a list of per-service verdicts
 * (`[{model: "stt", message: "Invalid Deepgram API key..."}]`). That list is
 * the operator's own key status and is exactly what the readiness panel has to
 * show, so it is formatted rather than swallowed. Any other detail shape is
 * still logged server-side only — it can carry internal payloads.
 */
function providerVerdicts(detail: unknown): string | null {
  if (!Array.isArray(detail) || detail.length === 0) return null;
  const lines: string[] = [];
  for (const entry of detail) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const record = entry as Record<string, unknown>;
    if (typeof record.model !== "string" || typeof record.message !== "string") {
      return null;
    }
    lines.push(`${record.model}: ${record.message}`);
  }
  return lines.join(" ");
}

function errorDetail(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "detail" in value) {
    const detail = (value as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    const verdicts = providerVerdicts(detail);
    if (verdicts) return verdicts;
    console.error("Dograh error detail:", detail);
  }
  return "Dograh request failed";
}

export interface DograhManagementClient {
  getWorkflow(id: number): Promise<DograhWorkflow>;
  createWorkflow(
    name: string,
    workflowDefinition: Record<string, unknown>,
  ): Promise<DograhWorkflow>;
  updateWorkflow(
    id: number,
    name: string,
    workflowDefinition: Record<string, unknown>,
    workflowConfigurations?: Record<string, unknown>,
  ): Promise<DograhWorkflow>;
  publishWorkflow(id: number): Promise<Record<string, unknown>>;
  archiveWorkflow(id: number): Promise<Record<string, unknown>>;
  requestUpload(
    filename: string,
    mimeType: string,
    businessId?: string,
  ): Promise<DograhUpload>;
  uploadBytes(uploadUrl: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  processDocument(
    documentUuid: string,
    s3Key: string,
    retrievalMode: string,
  ): Promise<Record<string, unknown>>;
  getDocument(documentUuid: string): Promise<DograhDocument>;
  deleteDocument(documentUuid: string): Promise<Record<string, unknown>>;
  listWorkflowRuns(
    workflowId: number,
    page?: number,
    limit?: number,
  ): Promise<DograhWorkflowRunsPage>;
  getWorkflowRun(workflowId: number, runId: number): Promise<DograhWorkflowRun>;
  fetchRunTranscript(publicUrl: string): Promise<string | null>;
  getEmbedToken(workflowId: number): Promise<DograhEmbedToken | null>;
  createEmbedToken(
    workflowId: number,
    settings: Record<string, unknown>,
    allowedDomains?: string[],
  ): Promise<DograhEmbedToken>;
  deactivateEmbedToken(workflowId: number): Promise<Record<string, unknown>>;
  createTool(body: Record<string, unknown>): Promise<DograhTool>;
  updateTool(
    toolUuid: string,
    body: Record<string, unknown>,
  ): Promise<DograhTool>;
  saveModelConfiguration(
    body: Record<string, unknown>,
  ): Promise<DograhModelConfiguration>;
  listTelephonyConfigurations(): Promise<DograhTelephonyConfiguration[]>;
  getTelephonyConfiguration(
    configId: number,
  ): Promise<DograhTelephonyConfigurationDetail>;
  createTelephonyConfiguration(
    body: Record<string, unknown>,
  ): Promise<{ id: number; name: string; provider: string }>;
  updateTelephonyConfiguration(
    configId: number,
    body: Record<string, unknown>,
  ): Promise<{ id: number; name: string; provider: string }>;
  listPhoneNumbers(configId: number): Promise<DograhPhoneNumber[]>;
  createPhoneNumber(
    configId: number,
    body: Record<string, unknown>,
  ): Promise<DograhPhoneNumber>;
  updatePhoneNumber(
    configId: number,
    phoneNumberId: number,
    body: Record<string, unknown>,
  ): Promise<DograhPhoneNumber>;
  deletePhoneNumber(configId: number, phoneNumberId: number): Promise<void>;
  initiateCall(body: {
    workflow_id: number;
    phone_number: string;
    telephony_configuration_id?: number;
    from_phone_number_id?: number;
  }): Promise<DograhInitiatedCall>;
}

/** The account a client authenticates as. */
export interface DograhCredentials {
  email: string;
  password: string;
  name: string;
}

export class DograhClient implements DograhManagementClient {
  private sessionToken: string | null = null;
  private authentication: Promise<string> | null = null;

  /**
   * Which Dograh account this client acts as.
   *
   * The platform account is the default so existing callers are unchanged. A
   * client constructed with a business's own credentials lands in that
   * business's organization, which is what scopes its workflows, tools and —
   * the reason this exists — its knowledge base.
   */
  constructor(private readonly credentials?: DograhCredentials) {}

  private account(): DograhCredentials {
    return (
      this.credentials ?? {
        email: env.dograhServiceEmail,
        password: env.dograhServicePassword,
        name: env.dograhServiceName,
      }
    );
  }

  private async authenticate(): Promise<string> {
    // A tenant client must never fall back to the platform API key: that key
    // authenticates as the platform organization, which would silently undo
    // the isolation this client exists to provide.
    if (env.dograhApiKey && !this.credentials) return env.dograhApiKey;
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
    const { email, password, name } = this.account();
    const login = await this.rawRequest<AuthResponse>("/auth/login", {
      method: "POST",
      authenticated: false,
      body: { email, password },
    }).catch((error: unknown) => {
      if (error instanceof DograhError && error.status === 401) return null;
      throw error;
    });

    if (login) return login.token;

    const signup = await this.rawRequest<AuthResponse>("/auth/signup", {
      method: "POST",
      authenticated: false,
      body: { email, password, name },
    }).catch((error: unknown) => {
      if (error instanceof DograhError && error.status === 409) return null;
      throw error;
    });

    if (signup) return signup.token;

    const retry = await this.rawRequest<AuthResponse>("/auth/login", {
      method: "POST",
      authenticated: false,
      body: { email, password },
    });
    return retry.token;
  }

  private async rawRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const authenticated = options.authenticated ?? true;
    const token = authenticated ? await this.authenticate() : null;
    // A tenant client always holds a session token, never the platform API key,
    // so it must send a bearer header even on a deployment where the API key is
    // configured. Sending its session token as `X-API-Key` would simply fail.
    const usesApiKey = Boolean(env.dograhApiKey) && !this.credentials;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${env.dograhInternalUrl}/api/v1${path}`, {
        method: options.method ?? "GET",
        headers: {
          ...(token
            ? usesApiKey
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

    if (response.status === 401 && authenticated && !usesApiKey && options.retryAuth !== false) {
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

  updateWorkflow(
    id: number,
    name: string,
    workflowDefinition: Record<string, unknown>,
    workflowConfigurations?: Record<string, unknown>,
  ): Promise<DograhWorkflow> {
    return this.rawRequest(`/workflow/${id}`, {
      method: "PUT",
      body: {
        name,
        workflow_definition: workflowDefinition,
        ...(workflowConfigurations
          ? { workflow_configurations: workflowConfigurations }
          : {}),
      },
    });
  }

  publishWorkflow(id: number): Promise<Record<string, unknown>> {
    return this.rawRequest(`/workflow/${id}/publish`, { method: "POST" });
  }

  archiveWorkflow(id: number): Promise<Record<string, unknown>> {
    return this.rawRequest(`/workflow/${id}/status`, {
      method: "PUT",
      body: { status: "archived" },
    });
  }

  listDocuments(limit = 100, offset = 0): Promise<DograhDocumentList> {
    return this.rawRequest(
      `/knowledge-base/documents?limit=${limit}&offset=${offset}`,
    );
  }

  requestUpload(
    filename: string,
    mimeType: string,
    businessId?: string,
  ): Promise<DograhUpload> {
    return this.rawRequest("/knowledge-base/upload-url", {
      method: "POST",
      body: {
        filename,
        mime_type: mimeType,
        custom_metadata: {
          source: "vocalonix",
          ...(businessId ? { business_id: businessId } : {}),
        },
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

  getDocument(documentUuid: string): Promise<DograhDocument> {
    return this.rawRequest(`/knowledge-base/documents/${documentUuid}`);
  }

  listWorkflowRuns(
    workflowId: number,
    page = 1,
    limit = 50,
  ): Promise<DograhWorkflowRunsPage> {
    return this.rawRequest(
      `/workflow/${workflowId}/runs?page=${page}&limit=${limit}`,
    );
  }

  getWorkflowRun(workflowId: number, runId: number): Promise<DograhWorkflowRun> {
    return this.rawRequest(`/workflow/${workflowId}/runs/${runId}`);
  }

  async fetchRunTranscript(publicUrl: string): Promise<string | null> {
    const destination = new URL(publicUrl);
    const internal = new URL(env.dograhInternalUrl);
    destination.protocol = internal.protocol;
    destination.hostname = internal.hostname;
    destination.port = internal.port;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(destination, {
        signal: controller.signal,
        redirect: "manual",
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return null;
        const storage = this.storageDestination(
          new URL(location, destination).toString(),
        );
        const download = await fetch(storage, { signal: controller.signal });
        if (!download.ok) return null;
        return await download.text();
      }
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  getEmbedToken(workflowId: number): Promise<DograhEmbedToken | null> {
    return this.rawRequest<DograhEmbedToken>(
      `/workflow/${workflowId}/embed-token`,
    ).catch((error: unknown) => {
      if (error instanceof DograhError && error.status === 404) return null;
      throw error;
    });
  }

  createEmbedToken(
    workflowId: number,
    settings: Record<string, unknown>,
    allowedDomains = env.dograhWidgetAllowedDomains,
  ): Promise<DograhEmbedToken> {
    return this.rawRequest(`/workflow/${workflowId}/embed-token`, {
      method: "POST",
      body: {
        allowed_domains: allowedDomains,
        settings,
        usage_limit: null,
        expires_in_days: null,
      },
    });
  }

  deactivateEmbedToken(workflowId: number): Promise<Record<string, unknown>> {
    return this.rawRequest(`/workflow/${workflowId}/embed-token`, {
      method: "DELETE",
    });
  }

  createTool(body: Record<string, unknown>): Promise<DograhTool> {
    return this.rawRequest("/tools/", { method: "POST", body });
  }

  updateTool(
    toolUuid: string,
    body: Record<string, unknown>,
  ): Promise<DograhTool> {
    return this.rawRequest(`/tools/${toolUuid}`, { method: "PUT", body });
  }

  getModelConfiguration(): Promise<DograhModelConfiguration> {
    return this.rawRequest("/organizations/model-configurations/v2");
  }

  saveModelConfiguration(
    body: Record<string, unknown>,
  ): Promise<DograhModelConfiguration> {
    return this.rawRequest("/organizations/model-configurations/v2", {
      method: "PUT",
      body,
    });
  }

  async listTelephonyConfigurations(): Promise<DograhTelephonyConfiguration[]> {
    const response = await this.rawRequest<{
      configurations: DograhTelephonyConfiguration[];
    }>("/organizations/telephony-configs");
    return response.configurations ?? [];
  }

  getTelephonyConfiguration(
    configId: number,
  ): Promise<DograhTelephonyConfigurationDetail> {
    return this.rawRequest(`/organizations/telephony-configs/${configId}`);
  }

  createTelephonyConfiguration(
    body: Record<string, unknown>,
  ): Promise<{ id: number; name: string; provider: string }> {
    return this.rawRequest("/organizations/telephony-configs", {
      method: "POST",
      body,
    });
  }

  updateTelephonyConfiguration(
    configId: number,
    body: Record<string, unknown>,
  ): Promise<{ id: number; name: string; provider: string }> {
    return this.rawRequest(`/organizations/telephony-configs/${configId}`, {
      method: "PUT",
      body,
    });
  }

  async listPhoneNumbers(configId: number): Promise<DograhPhoneNumber[]> {
    const response = await this.rawRequest<{
      phone_numbers: DograhPhoneNumber[];
    }>(`/organizations/telephony-configs/${configId}/phone-numbers`);
    return response.phone_numbers ?? [];
  }

  createPhoneNumber(
    configId: number,
    body: Record<string, unknown>,
  ): Promise<DograhPhoneNumber> {
    return this.rawRequest(
      `/organizations/telephony-configs/${configId}/phone-numbers`,
      { method: "POST", body },
    );
  }

  updatePhoneNumber(
    configId: number,
    phoneNumberId: number,
    body: Record<string, unknown>,
  ): Promise<DograhPhoneNumber> {
    return this.rawRequest(
      `/organizations/telephony-configs/${configId}/phone-numbers/${phoneNumberId}`,
      { method: "PUT", body },
    );
  }

  async deletePhoneNumber(
    configId: number,
    phoneNumberId: number,
  ): Promise<void> {
    await this.rawRequest(
      `/organizations/telephony-configs/${configId}/phone-numbers/${phoneNumberId}`,
      { method: "DELETE" },
    );
  }

  initiateCall(body: {
    workflow_id: number;
    phone_number: string;
    telephony_configuration_id?: number;
    from_phone_number_id?: number;
  }): Promise<DograhInitiatedCall> {
    return this.rawRequest("/telephony/initiate-call", {
      method: "POST",
      body,
    });
  }

  async uploadBytes(
    uploadUrl: string,
    bytes: Uint8Array,
    mimeType: string,
  ): Promise<void> {
    const destination = this.storageDestination(uploadUrl);
    const response = await fetch(destination, {
      method: "PUT",
      headers: { "Content-Type": mimeType || "application/octet-stream" },
      body: bytes,
    });

    if (!response.ok) {
      throw new DograhError(
        "Failed to upload the document to Dograh storage",
        response.status,
      );
    }
  }

  async uploadFile(uploadUrl: string, file: File): Promise<void> {
    const destination = this.storageDestination(uploadUrl);
    const response = await fetch(destination, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });

    if (!response.ok) {
      throw new DograhError(
        "Failed to upload the document to Dograh storage",
        response.status,
      );
    }
  }

  private storageDestination(uploadUrl: string): URL {
    const destination = new URL(uploadUrl);
    if (env.dograhStorageInternalUrl) {
      const internal = new URL(env.dograhStorageInternalUrl);
      destination.protocol = internal.protocol;
      destination.hostname = internal.hostname;
      destination.port = internal.port;
    }
    return destination;
  }
}

/** The platform account. Owns the demo agents and anything not tenant-scoped. */
export const dograh = new DograhClient();

/**
 * Clients are cached per business so a workspace logs in to the engine once
 * rather than on every sync, upload and ingest pass. The cache holds a session
 * token, not a credential — the credentials are derived on demand — so an entry
 * going stale costs one re-login, which `rawRequest` already handles on a 401.
 */
const tenantClients = new Map<string, DograhClient>();

export function tenantDograhClient(
  businessId: string,
  credentials: DograhCredentials,
): DograhManagementClient {
  const existing = tenantClients.get(businessId);
  if (existing) return existing;
  const client = new DograhClient(credentials);
  tenantClients.set(businessId, client);
  return client;
}

/** Drops a cached client, so an offboarded business leaves nothing behind. */
export function forgetTenantDograhClient(businessId: string): void {
  tenantClients.delete(businessId);
}
