import { edenTreaty } from "@elysiajs/eden";

import type { App } from "../../api/src/index";
import type {
  AgentResponse,
  AgentSettings,
  DocumentItem,
  WidgetResponse,
} from "./types";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
    /\/+$/,
    "",
  ) ?? "";

const client = edenTreaty<App>(API_BASE_URL, {
  $fetch: { credentials: "include" },
});

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

interface ClientResult<T> {
  data: T | null;
  error: null | { value?: unknown };
  status: number;
}

function errorPayload(value: unknown): { error?: string; code?: string } | null {
  if (!value || typeof value !== "object") return null;

  const error =
    "error" in value && typeof value.error === "string"
      ? value.error
      : undefined;
  const code =
    "code" in value && typeof value.code === "string" ? value.code : undefined;
  return { error, code };
}

function unwrap<T>(result: ClientResult<T>): T {
  if (result.error || result.data === null) {
    const payload = errorPayload(result.error?.value);
    throw new ApiClientError(
      result.status,
      payload?.code ?? null,
      payload?.error ?? `Request failed with status ${result.status}`,
    );
  }
  return result.data;
}

export interface AuthSession {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
  };
  session: {
    id: string;
    createdAt: string | Date;
    updatedAt: string | Date;
    expiresAt: string | Date;
  };
}

export interface AccountSession {
  id: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  expiresAt: string | Date;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
}

export type Role = "Owner" | "Admin" | "Manager" | "Staff" | "Viewer";

export interface BusinessSummary {
  id: string;
  slug: string;
  name: string;
  initial: string;
  city: string | null;
  country: string;
  timezone: string;
  role: Role;
  joinedAt: string | Date;
}

export interface BusinessDetail {
  id: string;
  slug: string;
  name: string;
  initial: string;
  city: string | null;
  country: string;
  timezone: string;
  role: Role;
}

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string | Date;
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: Role;
  expiresAt: string | Date;
  createdAt: string | Date;
  lastSentAt: string | Date;
}

export interface InvitationLookup {
  state: "invalid" | "valid" | "expired" | "revoked" | "accepted";
  invitation?: {
    id: string;
    businessName: string;
    businessSlug: string;
    email: string;
    expiresAt: string | Date;
    inviterName: string;
    role: Role;
  };
}

export interface BusinessHoursDay {
  enabled: boolean;
  open: string;
  close: string;
}

export interface TenantSettings {
  agentName: string;
  greeting: string;
  prompt: string;
  closing: string;
  tone: string;
  voice: string;
  allowInterrupt: boolean;
  escalationGuidance: string;
  businessHours: Record<string, BusinessHoursDay>;
  widgetButtonText: string;
  widgetColor: string;
  allowedDomains: string[];
}

export interface TenantSettingsResponse {
  business: {
    id: string;
    slug: string;
    name: string;
    city: string | null;
    country: string;
    timezone: string;
    contactEmail: string | null;
    vertical: string | null;
    role: Role;
  };
  settings: TenantSettings;
  onboarding: {
    completedSteps: string[];
    currentStep: string;
    publishedAt: string | Date | null;
  };
  dograh: {
    workflowId: string | null;
    workflowUuid: string | null;
    configVersion: number;
    configHash: string | null;
    syncedConfigHash: string | null;
    syncState:
      | "pending"
      | "syncing"
      | "synced"
      | "rejected"
      | "failed"
      | "offboarding"
      | "offboarded";
    errorCategory: string | null;
    lastError: string | null;
    lastAttemptAt: string | Date | null;
    lastSuccessAt: string | Date | null;
  };
}

export interface TenantKnowledgeItem {
  id: string;
  kind: "document" | "text" | "website_reference";
  title: string;
  filename: string;
  mimeType: string;
  retrievalMode: string;
  remoteDocumentUuid: string | null;
  sourceText: string | null;
  state:
    | "pending"
    | "uploading"
    | "processing"
    | "active"
    | "failed"
    | "delete_pending";
  active: boolean;
  replacesKnowledgeId: string | null;
  lastError: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface TenantWidget {
  workflowId: number;
  scriptUrl: string;
  snippet: string;
  settings: Record<string, unknown> | null;
}

export const api = {
  status: async () =>
    unwrap(await client.api.dograh.status.get()),
  getAgent: async (): Promise<AgentResponse> =>
    unwrap(await client.api.agent.get()),
  updateAgent: async (settings: AgentSettings): Promise<AgentResponse> =>
    unwrap(await client.api.agent.put(settings)),
  getWidget: async (): Promise<WidgetResponse> =>
    unwrap(await client.api.agent.widget.get()),
  listDocuments: async (): Promise<{ documents: DocumentItem[] }> =>
    unwrap(await client.api.knowledge.get()),
  uploadDocument: async (
    file: File,
    retrievalMode: "full_document" | "chunked",
  ) =>
    unwrap(
      await client.api.knowledge.post({
        file,
        retrievalMode,
      }),
    ),
  deleteDocument: async (documentUuid: string) =>
    unwrap(await client.api.knowledge[documentUuid].delete()),
  auth: {
    signup: async (input: {
      name: string;
      email: string;
      password: string;
      returnTo?: string;
    }) => unwrap(await client.api.auth.signup.post(input)),
    login: async (input: {
      email: string;
      password: string;
      rememberMe?: boolean;
    }) => unwrap(await client.api.auth.login.post(input)),
    session: async (): Promise<AuthSession | null> => {
      const result = unwrap(await client.api.auth.session.get());
      return result.session;
    },
    refresh: async (): Promise<AuthSession | null> => {
      const result = unwrap(await client.api.auth.refresh.post());
      return result.session;
    },
    logout: async () => unwrap(await client.api.auth.logout.post()),
    logoutAll: async () => unwrap(await client.api.auth["logout-all"].post()),
    sessions: async (): Promise<AccountSession[]> => {
      const result = unwrap(await client.api.auth.sessions.get());
      return result.sessions;
    },
    requestMagicLink: async (email: string, returnTo?: string) =>
      unwrap(await client.api.auth.magic.request.post({ email, returnTo })),
    consumeMagicLink: async (token: string) =>
      unwrap(await client.api.auth.magic.consume.post({ token })),
    verifyEmail: async (token: string) =>
      unwrap(await client.api.auth.email.verify.post({ token })),
  },
  businesses: {
    list: async (): Promise<BusinessSummary[]> => {
      const result = unwrap(await client.api.businesses.get());
      return result.businesses;
    },
    create: async (input: {
      name: string;
      slug: string;
      country?: string;
      timezone?: string;
      city?: string;
      contactEmail?: string;
      vertical?: string;
      locations?: string;
    }): Promise<BusinessDetail> => {
      const result = unwrap(await client.api.businesses.post(input));
      return result.business;
    },
    get: async (slug: string): Promise<BusinessDetail> => {
      const result = unwrap(await client.api.b[slug].get());
      return result.business;
    },
    settings: async (slug: string): Promise<TenantSettingsResponse> =>
      unwrap(await client.api.b[slug].settings.get()) as TenantSettingsResponse,
    updateProfile: async (
      slug: string,
      input: {
        name: string;
        city?: string;
        country: string;
        timezone: string;
        contactEmail?: string;
        vertical?: string;
      },
    ) => unwrap(await client.api.b[slug].settings.profile.put(input)),
    updateAgentSettings: async (
      slug: string,
      input: Pick<
        TenantSettings,
        | "agentName"
        | "greeting"
        | "prompt"
        | "closing"
        | "tone"
        | "voice"
        | "allowInterrupt"
        | "escalationGuidance"
      >,
    ) => unwrap(await client.api.b[slug].settings.agent.put(input)),
    updateHours: async (
      slug: string,
      businessHours: Record<string, BusinessHoursDay>,
    ) =>
      unwrap(
        await client.api.b[slug].settings.hours.put({ businessHours }),
      ),
    updateWidget: async (
      slug: string,
      input: Pick<
        TenantSettings,
        "widgetButtonText" | "widgetColor" | "allowedDomains"
      >,
    ) => unwrap(await client.api.b[slug].settings.widget.put(input)),
    completeKnowledgeOnboarding: async (slug: string) =>
      unwrap(
        await client.api.b[slug].onboarding.knowledge.complete.post(),
      ),
    dograhStatus: async (slug: string) =>
      unwrap(await client.api.b[slug].dograh.get()),
    retryDograh: async (slug: string) =>
      unwrap(await client.api.b[slug].dograh.retry.post()),
    publish: async (slug: string): Promise<{ widget: TenantWidget }> =>
      unwrap(await client.api.b[slug].publish.post()) as {
        widget: TenantWidget;
      },
    widget: async (slug: string): Promise<TenantWidget> =>
      unwrap(await client.api.b[slug].widget.get()) as TenantWidget,
    knowledge: async (slug: string): Promise<TenantKnowledgeItem[]> => {
      const result = unwrap(await client.api.b[slug].knowledge.get());
      return result.knowledge as TenantKnowledgeItem[];
    },
    createKnowledge: async (
      slug: string,
      input: {
        kind: "document" | "text" | "website_reference";
        title: string;
        text?: string;
        websiteUrl?: string;
        file?: File;
        retrievalMode: "chunked" | "full_document";
        replacementId?: string;
      },
    ) =>
      unwrap(
        await client.api.b[slug].knowledge.post({
          kind: input.kind,
          title: input.title,
          retrievalMode: input.retrievalMode,
          ...(input.text !== undefined ? { text: input.text } : {}),
          ...(input.websiteUrl !== undefined
            ? { websiteUrl: input.websiteUrl }
            : {}),
          ...(input.file !== undefined ? { file: input.file } : {}),
          ...(input.replacementId !== undefined
            ? { replacementId: input.replacementId }
            : {}),
        }),
      ),
    deleteKnowledge: async (slug: string, knowledgeId: string) =>
      unwrap(await client.api.b[slug].knowledge[knowledgeId].delete()),
    delete: async (slug: string) =>
      unwrap(await client.api.b[slug].delete()),
    team: async (
      slug: string,
    ): Promise<{
      members: TeamMember[];
      invitations: PendingInvitation[];
    }> => unwrap(await client.api.b[slug].team.get()),
    invite: async (
      slug: string,
      input: { email: string; role: Role },
    ): Promise<{
      invitation: {
        id: string;
        email: string;
        role: Role;
        previewUrl: string | null;
      };
    }> => unwrap(await client.api.b[slug].invitations.post(input)),
    resendInvitation: async (
      slug: string,
      invitationId: string,
    ): Promise<{ success: boolean; previewUrl: string | null }> =>
      unwrap(
        await client.api.b[slug].invitations[invitationId].resend.post(),
      ),
    revokeInvitation: async (
      slug: string,
      invitationId: string,
    ): Promise<{ success: boolean }> =>
      unwrap(
        await client.api.b[slug].invitations[invitationId].revoke.post(),
      ),
    updateMemberRole: async (
      slug: string,
      userId: string,
      role: Role,
    ): Promise<{ success: boolean }> =>
      unwrap(await client.api.b[slug].team[userId].patch({ role })),
    removeMember: async (
      slug: string,
      userId: string,
    ): Promise<{ success: boolean }> =>
      unwrap(await client.api.b[slug].team[userId].delete()),
  },
  invitations: {
    get: async (token: string): Promise<InvitationLookup> =>
      unwrap(await client.api.invitations[token].get()),
    accept: async (
      token: string,
    ): Promise<{ success: boolean; businessSlug: string }> =>
      unwrap(await client.api.invitations[token].accept.post()),
  },
};
