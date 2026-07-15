import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("sessions_token_unique").on(table.token),
    index("sessions_user_id_idx").on(table.userId),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("accounts_user_id_idx").on(table.userId),
    uniqueIndex("accounts_provider_account_unique").on(
      table.providerId,
      table.accountId,
    ),
  ],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

export const magicLinkRequests = pgTable(
  "magic_link_requests",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("magic_link_requests_token_hash_unique").on(table.tokenHash),
    index("magic_link_requests_email_idx").on(table.email),
  ],
);

export const roleEnum = pgEnum("membership_role", [
  "Owner",
  "Admin",
  "Manager",
  "Staff",
  "Viewer",
]);

export const membershipStatusEnum = pgEnum("membership_status", [
  "active",
  "revoked",
]);

export const outboxStatusEnum = pgEnum("outbox_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const dograhSyncStateEnum = pgEnum("dograh_sync_state", [
  "pending",
  "syncing",
  "synced",
  "rejected",
  "failed",
  "offboarding",
  "offboarded",
]);

export const knowledgeKindEnum = pgEnum("knowledge_kind", [
  "document",
  "text",
  "website_reference",
]);

export const knowledgeStateEnum = pgEnum("knowledge_state", [
  "pending",
  "uploading",
  "processing",
  "active",
  "failed",
  "delete_pending",
  "deleted",
]);

const bytea = customType<{ data: Uint8Array }>({
  dataType() {
    return "bytea";
  },
});

export const businesses = pgTable(
  "businesses",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    initial: text("initial").notNull(),
    country: text("country").notNull().default("US"),
    timezone: text("timezone").notNull().default("America/New_York"),
    city: text("city"),
    contactEmail: text("contact_email"),
    vertical: text("vertical"),
    locations: text("locations"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("businesses_slug_unique").on(table.slug),
    index("businesses_created_by_idx").on(table.createdBy),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    status: membershipStatusEnum("status").notNull().default("active"),
    invitedBy: text("invited_by").references(() => users.id),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.businessId] }),
    index("memberships_user_status_idx").on(table.userId, table.status),
    index("memberships_business_status_idx").on(table.businessId, table.status),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: roleEnum("role").notNull(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("invitations_token_hash_unique").on(table.tokenHash),
    uniqueIndex("invitations_pending_email_unique")
      .on(table.businessId, table.email)
      .where(sql`${table.acceptedAt} is null and ${table.revokedAt} is null`),
    index("invitations_business_email_idx").on(table.businessId, table.email),
    index("invitations_business_created_idx").on(table.businessId, table.createdAt),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id").references(() => businesses.id, {
      onDelete: "set null",
    }),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_logs_business_created_idx").on(table.businessId, table.createdAt),
    index("audit_logs_actor_idx").on(table.actorUserId),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id").references(() => businesses.id, {
      onDelete: "cascade",
    }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: outboxStatusEnum("status").notNull().default("pending"),
    dedupeKey: text("dedupe_key"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(8),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    index("outbox_events_status_created_idx").on(table.status, table.createdAt),
    index("outbox_events_available_idx").on(table.status, table.availableAt),
    index("outbox_events_business_idx").on(table.businessId),
    uniqueIndex("outbox_events_dedupe_key_active_unique")
      .on(table.dedupeKey)
      .where(sql`${table.status} in ('pending', 'processing')`),
  ],
);

export const businessDograhMappings = pgTable(
  "business_dograh_mappings",
  {
    businessId: text("business_id")
      .primaryKey()
      .references(() => businesses.id, { onDelete: "cascade" }),
    workflowId: text("workflow_id"),
    workflowUuid: text("workflow_uuid"),
    configVersion: integer("config_version").notNull().default(1),
    configHash: text("config_hash"),
    syncedConfigHash: text("synced_config_hash"),
    syncState: dograhSyncStateEnum("sync_state").notNull().default("pending"),
    errorCategory: text("error_category"),
    lastError: text("last_error"),
    syncLeaseId: text("sync_lease_id"),
    syncLeaseExpiresAt: timestamp("sync_lease_expires_at", { withTimezone: true }),
    retryRequestedAt: timestamp("retry_requested_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    offboardedAt: timestamp("offboarded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("business_dograh_sync_state_idx").on(table.syncState),
    uniqueIndex("business_dograh_workflow_id_unique").on(table.workflowId),
  ],
);

export const businessAgentSettings = pgTable("business_agent_settings", {
  businessId: text("business_id")
    .primaryKey()
    .references(() => businesses.id, { onDelete: "cascade" }),
  agentName: text("agent_name").notNull().default("Nova"),
  greeting: text("greeting")
    .notNull()
    .default("Hi, thanks for visiting. I am Nova. How can I help you today?"),
  prompt: text("prompt")
    .notNull()
    .default(
      "Answer clearly from saved business context and attached knowledge. If the answer is unknown, say a team member can follow up instead of guessing.",
    ),
  closing: text("closing").notNull().default("Thanks for visiting. Have a great day."),
  tone: text("tone").notNull().default("warm"),
  voice: text("voice").notNull().default("natural"),
  allowInterrupt: boolean("allow_interrupt").notNull().default(true),
  escalationGuidance: text("escalation_guidance")
    .notNull()
    .default("Offer to have a team member follow up when a request needs human help."),
  businessHours: jsonb("business_hours")
    .$type<Record<string, { enabled: boolean; open: string; close: string }>>()
    .notNull()
    .default({}),
  widgetButtonText: text("widget_button_text").notNull().default("Talk to us"),
  widgetColor: text("widget_color").notNull().default("#5b5bd6"),
  allowedDomains: jsonb("allowed_domains").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const businessOnboarding = pgTable("business_onboarding", {
  businessId: text("business_id")
    .primaryKey()
    .references(() => businesses.id, { onDelete: "cascade" }),
  completedSteps: jsonb("completed_steps").$type<string[]>().notNull().default([]),
  currentStep: text("current_step").notNull().default("business-profile"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const businessKnowledge = pgTable(
  "business_knowledge",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    kind: knowledgeKindEnum("kind").notNull(),
    title: text("title").notNull(),
    sourceText: text("source_text"),
    sourceBytes: bytea("source_bytes"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    retrievalMode: text("retrieval_mode").notNull().default("chunked"),
    remoteDocumentUuid: text("remote_document_uuid"),
    remoteStorageKey: text("remote_storage_key"),
    state: knowledgeStateEnum("state").notNull().default("pending"),
    active: boolean("active").notNull().default(false),
    replacesKnowledgeId: text("replaces_knowledge_id"),
    lastError: text("last_error"),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("business_knowledge_business_idx").on(table.businessId),
    index("business_knowledge_state_idx").on(table.state),
    uniqueIndex("business_knowledge_remote_uuid_unique").on(table.remoteDocumentUuid),
  ],
);

export type Role = (typeof roleEnum.enumValues)[number];
