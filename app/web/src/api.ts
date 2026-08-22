import { edenTreaty } from "@elysiajs/eden";

import type { App } from "../../api/src/index";
import type {
  BusinessPhoneNumber,
  AvailableNumber,
  BusinessPhoneResponse,
  DemoSession,
  DemoStartResponse,
  DograhHealth,
  PlatformStatus,
  PooledNumber,
  Vertical,
  VoiceCatalogueEntry,
  BillingStatus,
  PublicPricing,
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
  // `== null` catches undefined as well as null. A transport or shape failure can
  // yield `data: undefined` with no `error`, which previously flowed straight into
  // callers and threw deep inside a render instead of here.
  if (result.error || result.data == null) {
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

export interface BusinessListResponse {
  businesses: BusinessSummary[];
  workspaceLimit: number;
  canCreateWorkspace: boolean;
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
  transferPhone: string;
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

export interface TenantConfigSnapshot {
  name: string;
  city: string | null;
  country: string;
  timezone: string;
  contactEmail: string | null;
  vertical: string | null;
  agentName: string;
  greeting: string;
  prompt: string;
  closing: string;
  tone: string;
  voice: string;
  allowInterrupt: boolean;
  escalationGuidance: string;
  transferPhone: string;
  businessHours: Record<string, BusinessHoursDay>;
  widgetButtonText: string;
  widgetColor: string;
  allowedDomains: string[];
}

export interface TenantConfigVersion {
  id: string;
  version: number;
  config: TenantConfigSnapshot;
  publishedAt: string | Date;
  publishedByName: string | null;
}

export interface TenantConfigVersionsResponse {
  versions: TenantConfigVersion[];
  draft: TenantConfigSnapshot;
}

export interface ConversationSummary {
  id: number;
  startedAt: string;
  mode: string;
  completed: boolean;
  durationSeconds: number | null;
  disposition: string | null;
  nodesVisited: string[];
  hasTranscript: boolean;
  hasRecording: boolean;
}

export interface ConversationsResponse {
  conversations: ConversationSummary[];
  totalCount: number;
  page: number;
  totalPages: number;
}

export interface ConversationDetail extends ConversationSummary {
  transcriptUrl: string | null;
  recordingUrl: string | null;
}

export interface DashboardStats {
  range: "today" | "7d" | "30d";
  callsAnswered: number;
  completedCalls: number;
  totalSeconds: number;
  averageSeconds: number;
  hourly: number[];
  recent: ConversationSummary[];
}

export interface CallbackTask {
  id: string;
  contactName: string;
  contactChannel: string;
  contactId: string | null;
  reason: string;
  source: "call" | "manual";
  runId: number | null;
  promisedAt: string;
  assignedTo: string | null;
  assigneeName: string | null;
  status: "open" | "spoke" | "voicemail" | "dropped";
  attempts: { at: string; note: string }[];
  createdAt: string;
  closedAt: string | null;
  /** False when the channel is an email or a number without a dial code. */
  dialable: boolean;
}

export interface CallbacksResponse {
  callbacks: CallbackTask[];
  hasMore: boolean;
  members: { userId: string; name: string; role: string }[];
  viewerId: string;
  canManage: boolean;
}

export interface CallbackUpdate {
  assignedTo?: string | null;
  promisedAt?: string;
  status?: CallbackTask["status"];
  attemptNote?: string;
}

export interface BookingResource {
  id: string;
  name: string;
  subtitle: string;
  kind: "person" | "room";
  hours: string;
  notes: string;
  active: boolean;
  sortOrder: number;
}

export interface BookingService {
  id: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
  price: string;
  deposit: string;
  agentBookable: boolean;
  active: boolean;
}

export interface Booking {
  id: string;
  resourceId: string;
  serviceId: string | null;
  title: string;
  customerName: string;
  customerPhone: string;
  contactId: string | null;
  startAt: string;
  durationMinutes: number;
  status: "booked" | "arrived" | "cancelled" | "no_show";
  source: "agent" | "desk" | "web";
  price: string;
  note: string;
  runId: number | null;
}

export interface ContactActivityResponse {
  bookings: {
    id: string;
    title: string;
    startAt: string;
    durationMinutes: number;
    status: Booking["status"];
    source: Booking["source"];
  }[];
  callbacks: {
    id: string;
    reason: string;
    status: CallbackTask["status"];
    promisedAt: string;
    source: "call" | "manual";
    createdAt: string;
  }[];
}

export interface BookingsResponse {
  resources: BookingResource[];
  services: BookingService[];
  bookings: Booking[];
  canManage: boolean;
  canConfigure: boolean;
}

export interface KnowledgeGap {
  id: string;
  question: string;
  agentResponse: string;
  askCount: number;
  status: "open" | "answered" | "dismissed";
  lastAskedAt: string;
  createdAt: string;
}

export interface KnowledgeGapsResponse {
  gaps: KnowledgeGap[];
  canManage: boolean;
}

export interface Contact {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  tags: string[];
  note: string;
  source: "call" | "manual" | "import";
  createdAt: string;
  updatedAt: string;
}

export interface ContactsResponse {
  contacts: Contact[];
  hasMore: boolean;
  canManage: boolean;
}

export interface ContactInput {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  tags?: string[];
  note?: string;
}

export interface TenantWidget {
  workflowId: number;
  scriptUrl: string;
  snippet: string;
  settings: Record<string, unknown> | null;
}

export const api = {
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
  billing: {
    /** The public catalogue. No session — this is what /pricing renders. */
    plans: async (): Promise<PublicPricing> =>
      unwrap(await client.api.plans.get()),
    status: async (slug: string): Promise<BillingStatus> =>
      unwrap(await client.api.b[slug].billing.get()),
    portal: async (slug: string): Promise<{ url: string }> =>
      unwrap(await client.api.b[slug].billing.portal.post()),
    checkout: async (
      slug: string,
      planId: string,
      returnTo?: "account" | "onboarding",
    ): Promise<{ url: string }> =>
      unwrap(await client.api.b[slug].billing.checkout.post({ planId, returnTo })),
  },
  businesses: {
    list: async (): Promise<BusinessListResponse> => {
      const result = unwrap(await client.api.businesses.get());
      return {
        businesses: result.businesses,
        workspaceLimit: result.workspaceLimit,
        canCreateWorkspace: result.canCreateWorkspace,
      };
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
        | "transferPhone"
      >,
    ) => unwrap(await client.api.b[slug].settings.agent.put(input)),
    phone: async (slug: string): Promise<BusinessPhoneResponse> =>
      unwrap(await client.api.b[slug].phone.get()) as BusinessPhoneResponse,
    availableNumbers: async (
      slug: string,
      query: { country?: string; areaCode?: string; contains?: string },
    ): Promise<{ numbers: AvailableNumber[] }> =>
      unwrap(
        await client.api.b[slug].phone.available.get({ $query: query }),
      ) as { numbers: AvailableNumber[] },
    attachPhone: async (
      slug: string,
      input: { number: string; label?: string },
    ): Promise<{ number: BusinessPhoneNumber }> =>
      unwrap(await client.api.b[slug].phone.post(input)) as {
        number: BusinessPhoneNumber;
      },
    pooledNumbers: async (slug: string): Promise<{ numbers: PooledNumber[] }> =>
      unwrap(await client.api.b[slug].phone.pool.get()) as {
        numbers: PooledNumber[];
      },
    releasePhone: async (
      slug: string,
      phoneNumberId: string,
      password: string,
    ) => {
      const phone = client.api.b[slug].phone as unknown as Record<string, unknown>;
      return unwrap(
        await (
          phone[phoneNumberId] as {
            release: {
              post: (body: {
                password: string;
              }) => Promise<ClientResult<unknown>>;
            };
          }
        ).release.post({ password }),
      );
    },
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
    completePlanOnboarding: async (slug: string) =>
      unwrap(await client.api.b[slug].onboarding.plan.complete.post()),
    dograhStatus: async (slug: string) =>
      unwrap(await client.api.b[slug].dograh.get()),
    retryDograh: async (slug: string) =>
      unwrap(await client.api.b[slug].dograh.retry.post()),
    configVersions: async (
      slug: string,
    ): Promise<TenantConfigVersionsResponse> =>
      unwrap(
        await client.api.b[slug].settings.versions.get(),
      ) as unknown as TenantConfigVersionsResponse,
    publish: async (slug: string): Promise<{ widget: TenantWidget }> =>
      unwrap(await client.api.b[slug].publish.post()) as {
        widget: TenantWidget;
      },
    widget: async (slug: string): Promise<TenantWidget> =>
      unwrap(await client.api.b[slug].widget.get()) as TenantWidget,
    dashboard: async (
      slug: string,
      range: "today" | "7d" | "30d",
    ): Promise<DashboardStats> =>
      unwrap(
        await client.api.b[slug].dashboard.get({
          $query: { range },
        }),
      ) as unknown as DashboardStats,
    contacts: async (slug: string, offset = 0): Promise<ContactsResponse> =>
      unwrap(
        await client.api.b[slug].contacts.get({
          $query: { offset: String(offset) },
        }),
      ) as unknown as ContactsResponse,
    createContact: async (
      slug: string,
      input: ContactInput,
    ): Promise<{ contact: Contact }> =>
      unwrap(
        await client.api.b[slug].contacts.post(input),
      ) as unknown as { contact: Contact },
    importContacts: async (
      slug: string,
      rows: { name?: string | null; phone?: string | null; email?: string | null }[],
    ): Promise<{ contacts: Contact[] }> =>
      unwrap(
        await client.api.b[slug].contacts.import.post({ rows }),
      ) as unknown as { contacts: Contact[] },
    updateContact: async (
      slug: string,
      contactId: string,
      update: ContactInput,
    ): Promise<{ contact: Contact }> =>
      unwrap(
        await client.api.b[slug].contacts[contactId].patch(update),
      ) as unknown as { contact: Contact },
    deleteContact: async (slug: string, contactId: string): Promise<{ ok: boolean }> =>
      unwrap(
        await client.api.b[slug].contacts[contactId].delete(),
      ) as unknown as { ok: boolean },
    contactActivity: async (
      slug: string,
      contactId: string,
    ): Promise<ContactActivityResponse> =>
      unwrap(
        await client.api.b[slug].contacts[contactId].activity.get(),
      ) as unknown as ContactActivityResponse,
    callbacks: async (slug: string, offset = 0): Promise<CallbacksResponse> =>
      unwrap(
        await client.api.b[slug].callbacks.get({
          $query: { offset: String(offset) },
        }),
      ) as unknown as CallbacksResponse,
    createCallback: async (
      slug: string,
      input: {
        contactName: string;
        contactChannel: string;
        reason: string;
        promisedAt: string;
        assignedTo?: string | null;
      },
    ): Promise<{ callback: CallbackTask }> =>
      unwrap(
        await client.api.b[slug].callbacks.post(input),
      ) as unknown as { callback: CallbackTask },
    updateCallback: async (
      slug: string,
      callbackId: string,
      update: CallbackUpdate,
    ): Promise<{ callback: CallbackTask }> =>
      unwrap(
        await client.api.b[slug].callbacks[callbackId].patch(update),
      ) as unknown as { callback: CallbackTask },
    callCallback: async (
      slug: string,
      callbackId: string,
    ): Promise<{ callback: CallbackTask | null; from: string }> =>
      unwrap(
        await client.api.b[slug].callbacks[callbackId].call.post(),
      ) as unknown as { callback: CallbackTask | null; from: string },
    conversations: async (
      slug: string,
      page = 1,
      limit = 25,
    ): Promise<ConversationsResponse> =>
      unwrap(
        await client.api.b[slug].conversations.get({
          $query: { page: String(page), limit: String(limit) },
        }),
      ) as unknown as ConversationsResponse,
    conversation: async (
      slug: string,
      runId: number,
    ): Promise<{ conversation: ConversationDetail }> =>
      unwrap(
        await client.api.b[slug].conversations[String(runId)].get(),
      ) as unknown as { conversation: ConversationDetail },
    knowledge: async (
      slug: string,
      offset = 0,
    ): Promise<{ knowledge: TenantKnowledgeItem[]; hasMore: boolean }> => {
      const result = unwrap(
        await client.api.b[slug].knowledge.get({
          $query: { offset: String(offset) },
        }),
      );
      return {
        knowledge: result.knowledge as TenantKnowledgeItem[],
        hasMore: Boolean((result as { hasMore?: boolean }).hasMore),
      };
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
    overview: async (
      slug: string,
    ): Promise<{ openCallbacks: number; openGaps: number }> =>
      unwrap(
        await client.api.b[slug].overview.get(),
      ) as unknown as { openCallbacks: number; openGaps: number },
    bookings: async (
      slug: string,
      from: string,
      to: string,
    ): Promise<BookingsResponse> =>
      unwrap(
        await client.api.b[slug].bookings.get({ $query: { from, to } }),
      ) as unknown as BookingsResponse,
    createBooking: async (
      slug: string,
      input: {
        resourceId: string;
        serviceId?: string | null;
        title: string;
        customerName?: string;
        customerPhone?: string;
        startAt: string;
        durationMinutes: number;
        source?: Booking["source"];
        price?: string;
        note?: string;
      },
    ): Promise<{ booking: Booking }> =>
      unwrap(
        await client.api.b[slug].bookings.post(input),
      ) as unknown as { booking: Booking },
    updateBooking: async (
      slug: string,
      bookingId: string,
      input: {
        startAt?: string;
        resourceId?: string;
        status?: Booking["status"];
        note?: string;
        customerName?: string;
        customerPhone?: string;
      },
    ): Promise<{ booking: Booking }> =>
      unwrap(
        await client.api.b[slug].bookings[bookingId].patch(input),
      ) as unknown as { booking: Booking },
    createBookingResource: async (
      slug: string,
      input: {
        name: string;
        subtitle?: string;
        kind?: BookingResource["kind"];
        hours?: string;
        notes?: string;
      },
    ): Promise<{ resource: BookingResource }> =>
      unwrap(
        await client.api.b[slug]["booking-resources"].post(input),
      ) as unknown as { resource: BookingResource },
    updateBookingResource: async (
      slug: string,
      resourceId: string,
      input: {
        name?: string;
        subtitle?: string;
        hours?: string;
        notes?: string;
        active?: boolean;
      },
    ): Promise<{ resource: BookingResource }> =>
      unwrap(
        await client.api.b[slug]["booking-resources"][resourceId].patch(input),
      ) as unknown as { resource: BookingResource },
    createBookingService: async (
      slug: string,
      input: {
        name: string;
        durationMinutes: number;
        bufferMinutes?: number;
        price?: string;
        deposit?: string;
        agentBookable?: boolean;
      },
    ): Promise<{ service: BookingService }> =>
      unwrap(
        await client.api.b[slug]["booking-services"].post(input),
      ) as unknown as { service: BookingService },
    updateBookingService: async (
      slug: string,
      serviceId: string,
      input: {
        name?: string;
        durationMinutes?: number;
        bufferMinutes?: number;
        price?: string;
        deposit?: string;
        agentBookable?: boolean;
        active?: boolean;
      },
    ): Promise<{ service: BookingService }> =>
      unwrap(
        await client.api.b[slug]["booking-services"][serviceId].patch(input),
      ) as unknown as { service: BookingService },
    knowledgeGaps: async (slug: string): Promise<KnowledgeGapsResponse> =>
      unwrap(
        await client.api.b[slug]["knowledge-gaps"].get(),
      ) as unknown as KnowledgeGapsResponse,
    updateKnowledgeGap: async (
      slug: string,
      gapId: string,
      status: KnowledgeGap["status"],
    ): Promise<{ gap: KnowledgeGap }> =>
      unwrap(
        await client.api.b[slug]["knowledge-gaps"][gapId].patch({ status }),
      ) as unknown as { gap: KnowledgeGap },
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
  dograhHealth: async (): Promise<DograhHealth> =>
    unwrap(await client.api.dograh.health.get()),
  platform: {
    voices: async (): Promise<VoiceCatalogueEntry[]> => {
      const result = unwrap(await client.api.platform.voices.get());
      return (result.voices ?? []) as VoiceCatalogueEntry[];
    },
    status: async (): Promise<PlatformStatus> =>
      unwrap(await client.api.platform.status.get()) as PlatformStatus,
    recheck: async (): Promise<PlatformStatus> =>
      unwrap(await client.api.platform.recheck.post()) as PlatformStatus,
  },
  verticals: async (): Promise<Vertical[]> => {
    const result = unwrap(await client.api.verticals.get());
    return result.verticals ?? [];
  },
  demo: {
    createSession: async (vertical: string): Promise<{ id: string }> => {
      const result = unwrap(await client.api.demo.sessions.post({ vertical }));
      return result.session;
    },
    updateSession: async (
      id: string,
      input: Partial<DemoSession>,
    ): Promise<{ id: string }> => {
      const session = client.api.demo.sessions as unknown as Record<string, unknown>;
      const result = await (session[id] as { patch: (input: Partial<DemoSession>) => Promise<ClientResult<unknown>> }).patch(input);
      const data = unwrap(result) as { session: { id: string } };
      return data.session;
    },
    start: async (id: string): Promise<DemoStartResponse> => {
      const session = client.api.demo.sessions as unknown as Record<string, unknown>;
      const result = await (session[id] as { start: { post: () => Promise<ClientResult<unknown>> } }).start.post();
      return unwrap(result) as DemoStartResponse;
    },
    end: async (
      id: string,
      input: { durationSeconds?: number } = {},
    ): Promise<{ ok: boolean }> => {
      const session = client.api.demo.sessions as unknown as Record<string, unknown>;
      const result = await (session[id] as { end: { post: (input: { durationSeconds?: number }) => Promise<ClientResult<unknown>> } }).end.post(input);
      return unwrap(result) as { ok: boolean };
    },
    feedback: async (
      id: string,
      input: {
        feedbackScore?: number;
        feedbackChips?: string[];
        feedbackText?: string;
        outcome?: "positive" | "neutral" | "negative" | "abandoned";
      },
    ): Promise<{ ok: boolean; outcome: string }> => {
      const session = client.api.demo.sessions as unknown as Record<string, unknown>;
      const result = await (session[id] as { feedback: { post: (input: object) => Promise<ClientResult<unknown>> } }).feedback.post(input);
      return unwrap(result) as { ok: boolean; outcome: string };
    },
  },
};
