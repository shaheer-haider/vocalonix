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
    stripeCustomerId: text("stripe_customer_id"),
    /** Plan id from the catalogue in billing/plans.ts, not a display name. */
    planName: text("plan_name"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    /**
     * Mirrors Stripe's subscription status. Kept locally so an entitlement
     * check is a column read rather than a call to Stripe on every request,
     * and so the product keeps working when Stripe is briefly unreachable.
     * The webhook is what keeps it honest.
     */
    planStatus: text("plan_status"),
    planPeriodEnd: timestamp("plan_period_end", { withTimezone: true }),
    /**
     * Set when the workspace has spent its plan's monthly minutes, and cleared
     * when an upgrade or a new billing period puts it back under.
     *
     * Minutes cannot be enforced when a call starts: the widget holds a
     * long-lived embed token and talks to the engine directly, so Harkbell is
     * never in the path. Suspension is therefore the enforcement — the embed
     * token is deactivated, which is what actually stops the next call. That
     * makes the ceiling soft by at most the call in flight, which is the normal
     * behaviour of a metered service and far better than the previous
     * behaviour of not enforcing the limit at all.
     */
    callsSuspendedAt: timestamp("calls_suspended_at", { withTimezone: true }),
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

/**
 * Small key/value store for platform-wide state the API owns but that has no
 * natural home on a business row — currently the hash of the model
 * configuration last pushed to Dograh and the provisioned telephony ids.
 */
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
    lastIngestedRunId: integer("last_ingested_run_id").notNull().default(0),
    agentToolUuids: jsonb("agent_tool_uuids")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
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

export const phoneNumberStatusEnum = pgEnum("phone_number_status", [
  "pending",
  "active",
  "failed",
  "released",
]);

/**
 * A PSTN number pointed at a business's agent. Dograh owns the provider-side
 * routing; this table is the tenant-scoped mirror so the workspace can show,
 * label and release its numbers without the browser ever touching Dograh.
 */
export const businessPhoneNumbers = pgTable(
  "business_phone_numbers",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    e164: text("e164").notNull(),
    label: text("label").notNull().default(""),
    countryCode: text("country_code"),
    provider: text("provider").notNull().default("telnyx"),
    dograhConfigId: integer("dograh_config_id"),
    dograhPhoneNumberId: integer("dograh_phone_number_id"),
    status: phoneNumberStatusEnum("status").notNull().default("pending"),
    lastError: text("last_error"),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  (table) => [
    index("business_phone_numbers_business_idx").on(table.businessId),
    // One live claim per number across the whole platform; released rows stay
    // for history and must not block a later re-claim.
    uniqueIndex("business_phone_numbers_e164_active_unique")
      .on(table.e164)
      .where(sql`${table.status} <> 'released'`),
    // One live number per business. Two concurrent purchases both pass the
    // application check before either inserts, and the loser of that race would
    // otherwise leave the business paying for a second number it never chose.
    uniqueIndex("business_phone_numbers_one_live_per_business")
      .on(table.businessId)
      .where(sql`${table.status} <> 'released'`),
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
  voice: text("voice").notNull().default("aria"),
  allowInterrupt: boolean("allow_interrupt").notNull().default(true),
  escalationGuidance: text("escalation_guidance")
    .notNull()
    .default("Offer to have a team member follow up when a request needs human help."),
  // Warm-transfer target. Only usable on PSTN calls; browser callers always
  // fall back to a message.
  transferPhone: text("transfer_phone").notNull().default(""),
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

export const businessConfigVersions = pgTable(
  "business_config_versions",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    publishedBy: text("published_by").references(() => users.id, {
      onDelete: "set null",
    }),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("business_config_versions_business_version_unique").on(
      table.businessId,
      table.version,
    ),
    index("business_config_versions_business_idx").on(
      table.businessId,
      table.publishedAt,
    ),
  ],
);

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

export const callbackStatusEnum = pgEnum("callback_status", [
  "open",
  "spoke",
  "voicemail",
  "dropped",
]);

export const callbackSourceEnum = pgEnum("callback_source", [
  "call",
  "manual",
]);

export const callbackTasks = pgTable(
  "callback_tasks",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    contactName: text("contact_name").notNull(),
    contactChannel: text("contact_channel").notNull(),
    contactId: text("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    reason: text("reason").notNull(),
    source: callbackSourceEnum("source").notNull().default("manual"),
    runId: integer("run_id"),
    promisedAt: timestamp("promised_at", { withTimezone: true }).notNull(),
    assignedTo: text("assigned_to").references(() => users.id, {
      onDelete: "set null",
    }),
    status: callbackStatusEnum("status").notNull().default("open"),
    attempts: jsonb("attempts")
      .$type<{ at: string; note: string }[]>()
      .notNull()
      .default([]),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    index("callback_tasks_business_status_idx").on(table.businessId, table.status),
    index("callback_tasks_business_promised_idx").on(
      table.businessId,
      table.promisedAt,
    ),
    index("callback_tasks_contact_idx").on(table.contactId),
  ],
);

export const contactSourceEnum = pgEnum("contact_source", [
  "call",
  "manual",
  "import",
]);

export const contacts = pgTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name"),
    phone: text("phone"),
    email: text("email"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    note: text("note").notNull().default(""),
    source: contactSourceEnum("source").notNull().default("manual"),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("contacts_business_idx").on(table.businessId),
    index("contacts_business_phone_idx").on(table.businessId, table.phone),
    index("contacts_business_email_idx").on(table.businessId, table.email),
  ],
);

export const bookingResourceKindEnum = pgEnum("booking_resource_kind", [
  "person",
  "room",
]);

export const bookingResources = pgTable(
  "booking_resources",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    subtitle: text("subtitle").notNull().default(""),
    kind: bookingResourceKindEnum("kind").notNull().default("person"),
    hours: text("hours").notNull().default(""),
    notes: text("notes").notNull().default(""),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("booking_resources_business_idx").on(table.businessId)],
);

export const bookingServices = pgTable(
  "booking_services",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    bufferMinutes: integer("buffer_minutes").notNull().default(0),
    price: text("price").notNull().default(""),
    deposit: text("deposit").notNull().default(""),
    agentBookable: boolean("agent_bookable").notNull().default(true),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("booking_services_business_idx").on(table.businessId)],
);

export const bookingStatusEnum = pgEnum("booking_status", [
  "booked",
  "arrived",
  "cancelled",
  "no_show",
]);

export const bookingSourceEnum = pgEnum("booking_source", [
  "agent",
  "desk",
  "web",
]);

export const bookings = pgTable(
  "bookings",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => bookingResources.id, { onDelete: "cascade" }),
    serviceId: text("service_id").references(() => bookingServices.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    customerName: text("customer_name").notNull().default(""),
    customerPhone: text("customer_phone").notNull().default(""),
    contactId: text("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    status: bookingStatusEnum("status").notNull().default("booked"),
    source: bookingSourceEnum("source").notNull().default("desk"),
    price: text("price").notNull().default(""),
    note: text("note").notNull().default(""),
    runId: integer("run_id"),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (table) => [
    index("bookings_business_start_idx").on(table.businessId, table.startAt),
    index("bookings_resource_start_idx").on(table.resourceId, table.startAt),
    index("bookings_contact_idx").on(table.contactId),
  ],
);

export const knowledgeGapStatusEnum = pgEnum("knowledge_gap_status", [
  "open",
  "answered",
  "dismissed",
]);

export const knowledgeGaps = pgTable(
  "knowledge_gaps",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    normalizedQuestion: text("normalized_question").notNull(),
    question: text("question").notNull(),
    agentResponse: text("agent_response").notNull().default(""),
    askCount: integer("ask_count").notNull().default(1),
    runId: integer("run_id"),
    status: knowledgeGapStatusEnum("status").notNull().default("open"),
    lastAskedAt: timestamp("last_asked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedBy: text("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("knowledge_gaps_business_question_unique").on(
      table.businessId,
      table.normalizedQuestion,
    ),
    index("knowledge_gaps_business_status_idx").on(
      table.businessId,
      table.status,
    ),
  ],
);

/**
 * One reusable demo agent per trade, instead of a throwaway workflow per
 * visitor.
 *
 * Building a workflow on the fly meant every visitor waited on three sequential
 * Dograh calls before they heard anything, and left a dead workflow behind on
 * the engine for ever. The demo agent is identical for every visitor in a
 * trade — it answers as an invented business — so there was never a reason for
 * it to be per-session. `configHash` is what makes the boot reconciler cheap:
 * unchanged trades are skipped entirely.
 */
export const demoAgents = pgTable("demo_agents", {
  vertical: text("vertical").primaryKey(),
  workflowId: integer("workflow_id").notNull(),
  workflowUuid: text("workflow_uuid"),
  /** Reused by every visitor; the demo has no per-caller secret to protect. */
  embedToken: text("embed_token").notNull(),
  configHash: text("config_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const demoSessions = pgTable(
  "demo_sessions",
  {
    id: text("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    vertical: text("vertical").notNull(),
    status: text("status").notNull().default("intake_started"),
    businessName: text("business_name"),
    city: text("city"),
    services: jsonb("services").$type<string[]>().notNull().default([]),
    bookingTool: text("booking_tool"),
    verticalAnswers: jsonb("vertical_answers")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    fullName: text("full_name"),
    email: text("email"),
    phone: text("phone"),
    demoMode: text("demo_mode"),
    voice: text("voice"),
    workflowId: integer("workflow_id"),
    durationSeconds: integer("duration_seconds"),
    transcript: jsonb("transcript").$type<Record<string, unknown>[]>(),
    recordingUrl: text("recording_url"),
    costUsd: text("cost_usd"),
    feedbackScore: integer("feedback_score"),
    feedbackChips: jsonb("feedback_chips").$type<string[]>().notNull().default([]),
    feedbackText: text("feedback_text"),
    outcome: text("outcome"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    referrer: text("referrer"),
  },
  (table) => [
    index("demo_sessions_email_idx").on(table.email),
    index("demo_sessions_status_idx").on(table.status),
    index("demo_sessions_created_at_idx").on(table.createdAt),
  ],
);

/**
 * One row per completed call, copied out of the engine as it is ingested.
 *
 * The engine remains the system of record for what was *said* — transcripts and
 * recordings are large, rarely read, and fetched for a single conversation on
 * demand. What a call *was* belongs here: the list, the dashboard and any
 * metered plan all need to count, filter and sum across every call a business
 * has ever taken, and none of that is answerable by paging a remote service.
 *
 * Before this table the dashboard fetched a hundred runs on every load and
 * aggregated them in memory, which made a "last 30 days" figure silently mean
 * "whichever of the last hundred calls fall in 30 days".
 */
export const callRecords = pgTable(
  "call_records",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    /** The engine's run id — the join back to transcripts and recordings. */
    runId: integer("run_id").notNull(),
    workflowId: integer("workflow_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    durationSeconds: integer("duration_seconds"),
    completed: boolean("completed").notNull().default(false),
    /** "voice", "text", and whatever the engine adds later. */
    mode: text("mode"),
    disposition: text("disposition"),
    /** Which workflow steps the call passed through; the list searches on it. */
    nodesVisited: jsonb("nodes_visited").$type<string[]>().notNull().default([]),
    /**
     * Whether the engine holds a transcript or recording for this call. Stored
     * so the list can say what exists without a round trip; the artefacts
     * themselves stay in the engine and are fetched when one is opened.
     */
    hasTranscript: boolean("has_transcript").notNull().default(false),
    hasRecording: boolean("has_recording").notNull().default(false),
    /** Caller ID for a phone call; null for a widget call, which has none. */
    callerNumber: text("caller_number"),
    contactId: text("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Ingest is re-runnable and a backfill may overlap it. Counting one call
    // twice would overstate a dashboard and overcharge a metered invoice, so
    // uniqueness is enforced here rather than trusted to the caller.
    uniqueIndex("call_records_business_run_unique").on(
      table.businessId,
      table.runId,
    ),
    index("call_records_business_started_idx").on(
      table.businessId,
      table.startedAt,
    ),
  ],
);

export type Role = (typeof roleEnum.enumValues)[number];
