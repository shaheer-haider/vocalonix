import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { normalizeEmail } from "../auth/email";
import { linkContact } from "./contactLink";
import { db } from "../db/client";
import {
  auditLogs,
  businessAgentSettings,
  businessDograhMappings,
  businessKnowledge,
  businessConfigVersions,
  businessOnboarding,
  businesses,
  bookingResources,
  bookingServices,
  bookings,
  callbackTasks,
  contacts,
  knowledgeGaps,
  memberships,
  outboxEvents,
  users,
} from "../db/schema";
import {
  DograhSyncError,
  publishBusinessWidget,
  synchronizeBusiness,
  tenantWidgetScript,
} from "../dograh/tenant";
import { dograh } from "../dograh/client";
import type { DograhWorkflowRun } from "../dograh/types";
import { ApiError } from "../errors";
import { paginate, parseListQuery } from "../pagination";
import {
  ALLOWED_DOCUMENT_TYPES_LABEL,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  isAllowedDocumentFilename,
  matchesDocumentSignature,
} from "../uploads";
import { requirePermission, requireWorkspace } from "../workspace/context";
import { can } from "../workspace/permissions";

async function assertNoClash(
  businessId: string,
  resourceId: string,
  startAt: Date,
  durationMinutes: number,
  ignoreBookingId: string | null,
): Promise<void> {
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
  const overlapping = await db
    .select({
      id: bookings.id,
      startAt: bookings.startAt,
      durationMinutes: bookings.durationMinutes,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.businessId, businessId),
        eq(bookings.resourceId, resourceId),
        ne(bookings.status, "cancelled"),
        lt(bookings.startAt, endAt),
      ),
    );
  const clash = overlapping.some(
    (row) =>
      row.id !== ignoreBookingId &&
      row.startAt.getTime() + row.durationMinutes * 60_000 >
        startAt.getTime(),
  );
  if (clash) {
    throw new ApiError(
      409,
      "BOOKING_CLASH",
      "Something else is already booked there.",
    );
  }
}

export const onboardingSteps = [
  "business-profile",
  "agent",
  "knowledge",
  "widget",
  "review",
] as const;

type OnboardingStep = (typeof onboardingSteps)[number];

function initialFor(name: string): string {
  return (name.trim()[0] ?? "V").toUpperCase();
}

function nextOnboardingStep(completedSteps: string[]): OnboardingStep {
  return (
    onboardingSteps.find((step) => !completedSteps.includes(step)) ?? "review"
  );
}

async function ensureTenantRows(businessId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(businessAgentSettings)
      .values({ businessId })
      .onConflictDoNothing();
    await tx
      .insert(businessOnboarding)
      .values({ businessId })
      .onConflictDoNothing();
  });
}

async function completeStep(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  businessId: string,
  step: OnboardingStep,
): Promise<void> {
  const [current] = await tx
    .select()
    .from(businessOnboarding)
    .where(eq(businessOnboarding.businessId, businessId))
    .limit(1);
  const completedSteps = [...new Set([...(current?.completedSteps ?? []), step])];
  await tx
    .insert(businessOnboarding)
    .values({
      businessId,
      completedSteps,
      currentStep: nextOnboardingStep(completedSteps),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: businessOnboarding.businessId,
      set: {
        completedSteps,
        currentStep: nextOnboardingStep(completedSteps),
        updatedAt: new Date(),
      },
    });
}

async function queueBusinessSync(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  businessId: string,
): Promise<void> {
  await tx
    .insert(outboxEvents)
    .values({
      id: randomUUID(),
      businessId,
      eventType: "dograh.workflow.sync",
      payload: { businessId },
      dedupeKey: `dograh.workflow.sync:${businessId}`,
    })
    .onConflictDoNothing();
}

async function queueBookingSync(businessId: string): Promise<void> {
  await db
    .insert(outboxEvents)
    .values({
      id: randomUUID(),
      businessId,
      eventType: "dograh.workflow.sync",
      payload: { businessId },
      dedupeKey: `dograh.workflow.sync:${businessId}`,
    })
    .onConflictDoNothing();
}

async function snapshotBusinessConfig(
  businessId: string,
): Promise<Record<string, unknown>> {
  const [row] = await db
    .select({ business: businesses, settings: businessAgentSettings })
    .from(businesses)
    .innerJoin(
      businessAgentSettings,
      eq(businessAgentSettings.businessId, businesses.id),
    )
    .where(eq(businesses.id, businessId))
    .limit(1);
  if (!row) {
    throw new ApiError(500, "SETTINGS_UNAVAILABLE", "Business settings are unavailable.");
  }
  return {
    name: row.business.name,
    city: row.business.city,
    country: row.business.country,
    timezone: row.business.timezone,
    contactEmail: row.business.contactEmail,
    vertical: row.business.vertical,
    agentName: row.settings.agentName,
    greeting: row.settings.greeting,
    prompt: row.settings.prompt,
    closing: row.settings.closing,
    tone: row.settings.tone,
    voice: row.settings.voice,
    allowInterrupt: row.settings.allowInterrupt,
    escalationGuidance: row.settings.escalationGuidance,
    businessHours: row.settings.businessHours,
    widgetButtonText: row.settings.widgetButtonText,
    widgetColor: row.settings.widgetColor,
    allowedDomains: row.settings.allowedDomains,
  };
}

async function requireTenantWorkflowId(businessId: string): Promise<number> {
  const [mapping] = await db
    .select()
    .from(businessDograhMappings)
    .where(eq(businessDograhMappings.businessId, businessId))
    .limit(1);
  if (!mapping?.workflowId) {
    throw new ApiError(
      404,
      "DOGRAH_WORKFLOW_NOT_FOUND",
      "This business does not have a published agent workflow yet.",
    );
  }
  return Number(mapping.workflowId);
}

function callbackView(
  task: typeof callbackTasks.$inferSelect,
  assigneeName: string | null,
) {
  return {
    id: task.id,
    contactName: task.contactName,
    contactChannel: task.contactChannel,
    contactId: task.contactId,
    reason: task.reason,
    source: task.source,
    runId: task.runId,
    promisedAt: task.promisedAt.toISOString(),
    assignedTo: task.assignedTo,
    assigneeName,
    status: task.status,
    attempts: task.attempts,
    createdAt: task.createdAt.toISOString(),
    closedAt: task.closedAt?.toISOString() ?? null,
  };
}

function contactView(contact: typeof contacts.$inferSelect) {
  return {
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    tags: contact.tags,
    note: contact.note,
    source: contact.source,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

function normalizeContactField(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTags(tags: string[]): string[] {
  return [
    ...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)),
  ].slice(0, 20);
}

function conversationSummary(run: DograhWorkflowRun) {
  return {
    id: run.id,
    startedAt: run.created_at,
    mode: run.mode,
    completed: run.is_completed,
    durationSeconds: run.cost_info?.call_duration_seconds ?? null,
    disposition:
      run.gathered_context?.mapped_call_disposition ??
      run.gathered_context?.call_disposition ??
      null,
    nodesVisited: run.gathered_context?.nodes_visited ?? [],
    hasTranscript: Boolean(run.transcript_url),
    hasRecording: Boolean(run.recording_url),
  };
}

function hourInTimezone(value: string, timezone: string): number {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hourCycle: "h23",
  }).format(new Date(value));
  return Number(formatted);
}

function startOfDayInTimezone(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const elapsedMs =
    ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000;
  return now.getTime() - elapsedMs;
}

function dograhApiError(error: unknown): never {
  if (error instanceof DograhSyncError) {
    const status =
      error.failure.category === "rejected"
        ? 422
        : error.failure.category === "unauthorized"
          ? 503
          : 502;
    throw new ApiError(status, "DOGRAH_SYNC_FAILED", error.failure.message);
  }
  throw error;
}

function normalizeDomains(domains: string[]): string[] {
  try {
    return [
      ...new Set(
        domains
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean)
          .map((value) => {
            if (value === "localhost" || value === "127.0.0.1") return value;
            const candidate = value.includes("://") ? value : `https://${value}`;
            const parsed = new URL(candidate);
            if (!parsed.host) throw new Error("Missing hostname");
            return parsed.host;
          }),
      ),
    ];
  } catch {
    throw new ApiError(
      400,
      "ALLOWED_DOMAIN_INVALID",
      "Enter valid widget hostnames, one per line.",
    );
  }
}

const hoursDay = t.Object({
  enabled: t.Boolean(),
  open: t.String({ pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" }),
  close: t.String({ pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" }),
});

export const tenantRoutes = new Elysia()
  .get("/api/b/:slug/settings", async ({ params, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    await ensureTenantRows(workspace.business.id);
    const [row] = await db
      .select({
        settings: businessAgentSettings,
        onboarding: businessOnboarding,
        mapping: businessDograhMappings,
      })
      .from(businessAgentSettings)
      .innerJoin(
        businessOnboarding,
        eq(businessOnboarding.businessId, businessAgentSettings.businessId),
      )
      .innerJoin(
        businessDograhMappings,
        eq(businessDograhMappings.businessId, businessAgentSettings.businessId),
      )
      .where(eq(businessAgentSettings.businessId, workspace.business.id))
      .limit(1);
    if (!row) {
      throw new ApiError(
        500,
        "SETTINGS_UNAVAILABLE",
        "Business settings are unavailable.",
      );
    }
    return {
      business: {
        id: workspace.business.id,
        slug: workspace.business.slug,
        name: workspace.business.name,
        city: workspace.business.city,
        country: workspace.business.country,
        timezone: workspace.business.timezone,
        contactEmail: workspace.business.contactEmail,
        vertical: workspace.business.vertical,
        role: workspace.role,
      },
      settings: row.settings,
      onboarding: row.onboarding,
      dograh: {
        workflowId: row.mapping.workflowId,
        workflowUuid: row.mapping.workflowUuid,
        configVersion: row.mapping.configVersion,
        configHash: row.mapping.configHash,
        syncedConfigHash: row.mapping.syncedConfigHash,
        syncState: row.mapping.syncState,
        errorCategory: row.mapping.errorCategory,
        lastError: row.mapping.lastError,
        lastAttemptAt: row.mapping.lastAttemptAt,
        lastSuccessAt: row.mapping.lastSuccessAt,
      },
    };
  })
  .put(
    "/api/b/:slug/settings/profile",
    async ({ body, params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      requirePermission(workspace.role, "agent.edit");
      const now = new Date();
      const name = body.name.trim();
      await ensureTenantRows(workspace.business.id);
      await db.transaction(async (tx) => {
        await tx
          .update(businesses)
          .set({
            name,
            initial: initialFor(name),
            city: body.city?.trim() || null,
            country: body.country.trim().toUpperCase(),
            timezone: body.timezone.trim(),
            contactEmail: body.contactEmail
              ? normalizeEmail(body.contactEmail)
              : null,
            vertical: body.vertical?.trim() || null,
            updatedAt: now,
          })
          .where(eq(businesses.id, workspace.business.id));
        await completeStep(tx, workspace.business.id, "business-profile");
        await queueBusinessSync(tx, workspace.business.id);
        await tx.insert(auditLogs).values({
          id: randomUUID(),
          businessId: workspace.business.id,
          actorUserId: workspace.session.user.id,
          action: "business.settings.profile.update",
          targetType: "business",
          targetId: workspace.business.id,
          payload: { name, country: body.country, timezone: body.timezone },
          createdAt: now,
        });
      });
      return { ok: true };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2, maxLength: 120 }),
        city: t.Optional(t.String({ maxLength: 120 })),
        country: t.String({ minLength: 2, maxLength: 2 }),
        timezone: t.String({ minLength: 1, maxLength: 80 }),
        contactEmail: t.Optional(t.String({ format: "email" })),
        vertical: t.Optional(t.String({ maxLength: 80 })),
      }),
    },
  )
  .put(
    "/api/b/:slug/settings/agent",
    async ({ body, params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      requirePermission(workspace.role, "agent.edit");
      const now = new Date();
      await ensureTenantRows(workspace.business.id);
      await db.transaction(async (tx) => {
        await tx
          .update(businessAgentSettings)
          .set({
            agentName: body.agentName.trim(),
            greeting: body.greeting.trim(),
            prompt: body.prompt.trim(),
            closing: body.closing.trim(),
            tone: body.tone,
            voice: body.voice,
            allowInterrupt: body.allowInterrupt,
            escalationGuidance: body.escalationGuidance.trim(),
            updatedAt: now,
          })
          .where(
            eq(businessAgentSettings.businessId, workspace.business.id),
          );
        await completeStep(tx, workspace.business.id, "agent");
        await queueBusinessSync(tx, workspace.business.id);
        await tx.insert(auditLogs).values({
          id: randomUUID(),
          businessId: workspace.business.id,
          actorUserId: workspace.session.user.id,
          action: "business.settings.agent.update",
          targetType: "business_agent_settings",
          targetId: workspace.business.id,
          payload: {
            agentName: body.agentName,
            tone: body.tone,
            voice: body.voice,
            allowInterrupt: body.allowInterrupt,
          },
          createdAt: now,
        });
      });
      return { ok: true };
    },
    {
      body: t.Object({
        agentName: t.String({ minLength: 1, maxLength: 80 }),
        greeting: t.String({ minLength: 1, maxLength: 500 }),
        prompt: t.String({ minLength: 1, maxLength: 4000 }),
        closing: t.String({ minLength: 1, maxLength: 500 }),
        tone: t.String({ minLength: 1, maxLength: 40 }),
        voice: t.String({ minLength: 1, maxLength: 40 }),
        allowInterrupt: t.Boolean(),
        escalationGuidance: t.String({ minLength: 1, maxLength: 1000 }),
      }),
    },
  )
  .put(
    "/api/b/:slug/settings/hours",
    async ({ body, params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      requirePermission(workspace.role, "agent.edit");
      const now = new Date();
      await ensureTenantRows(workspace.business.id);
      await db.transaction(async (tx) => {
        await tx
          .update(businessAgentSettings)
          .set({ businessHours: body.businessHours, updatedAt: now })
          .where(
            eq(businessAgentSettings.businessId, workspace.business.id),
          );
        await queueBusinessSync(tx, workspace.business.id);
        await tx.insert(auditLogs).values({
          id: randomUUID(),
          businessId: workspace.business.id,
          actorUserId: workspace.session.user.id,
          action: "business.settings.hours.update",
          targetType: "business_agent_settings",
          targetId: workspace.business.id,
          payload: { days: Object.keys(body.businessHours) },
          createdAt: now,
        });
      });
      return { ok: true };
    },
    {
      body: t.Object({
        businessHours: t.Record(t.String(), hoursDay),
      }),
    },
  )
  .put(
    "/api/b/:slug/settings/widget",
    async ({ body, params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      requirePermission(workspace.role, "agent.edit");
      const domains = normalizeDomains(body.allowedDomains);
      const now = new Date();
      await ensureTenantRows(workspace.business.id);
      await db.transaction(async (tx) => {
        await tx
          .update(businessAgentSettings)
          .set({
            widgetButtonText: body.widgetButtonText.trim(),
            widgetColor: body.widgetColor.toLowerCase(),
            allowedDomains: domains,
            updatedAt: now,
          })
          .where(
            eq(businessAgentSettings.businessId, workspace.business.id),
          );
        await completeStep(tx, workspace.business.id, "widget");
        await queueBusinessSync(tx, workspace.business.id);
        await tx.insert(auditLogs).values({
          id: randomUUID(),
          businessId: workspace.business.id,
          actorUserId: workspace.session.user.id,
          action: "business.settings.widget.update",
          targetType: "business_agent_settings",
          targetId: workspace.business.id,
          payload: {
            widgetButtonText: body.widgetButtonText,
            allowedDomains: domains,
          },
          createdAt: now,
        });
      });
      return { ok: true };
    },
    {
      body: t.Object({
        widgetButtonText: t.String({ minLength: 1, maxLength: 80 }),
        widgetColor: t.String({ pattern: "^#[0-9a-fA-F]{6}$" }),
        allowedDomains: t.Array(t.String({ minLength: 1, maxLength: 255 }), {
          maxItems: 50,
        }),
      }),
    },
  )
  .post(
    "/api/b/:slug/onboarding/knowledge/complete",
    async ({ params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      requirePermission(workspace.role, "knowledge.manage");
      await ensureTenantRows(workspace.business.id);
      await db.transaction(async (tx) => {
        await completeStep(tx, workspace.business.id, "knowledge");
        await tx.insert(auditLogs).values({
          id: randomUUID(),
          businessId: workspace.business.id,
          actorUserId: workspace.session.user.id,
          action: "business.onboarding.knowledge.complete",
          targetType: "business_onboarding",
          targetId: workspace.business.id,
        });
      });
      return { ok: true };
    },
  )
  .get("/api/b/:slug/dograh", async ({ params, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    const [mapping] = await db
      .select()
      .from(businessDograhMappings)
      .where(eq(businessDograhMappings.businessId, workspace.business.id))
      .limit(1);
    if (!mapping) {
      throw new ApiError(
        404,
        "DOGRAH_MAPPING_NOT_FOUND",
        "Dograh mapping was not found.",
      );
    }
    return { dograh: mapping };
  })
  .get("/api/b/:slug/conversations", async ({ params, query, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    const workflowId = await requireTenantWorkflowId(workspace.business.id);
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 25) || 25));
    const result = await dograh.listWorkflowRuns(workflowId, page, limit);
    return {
      conversations: result.runs.map(conversationSummary),
      totalCount: result.total_count,
      page: result.page,
      totalPages: result.total_pages,
    };
  })
  .get("/api/b/:slug/conversations/:runId", async ({ params, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    const workflowId = await requireTenantWorkflowId(workspace.business.id);
    const runId = Number(params.runId);
    if (!Number.isInteger(runId) || runId <= 0) {
      throw new ApiError(400, "INVALID_RUN_ID", "Invalid conversation id.");
    }
    const run = await dograh.getWorkflowRun(workflowId, runId);
    if (run.workflow_id !== workflowId) {
      throw new ApiError(
        404,
        "CONVERSATION_NOT_FOUND",
        "Conversation was not found for this business.",
      );
    }
    return {
      conversation: {
        ...conversationSummary(run),
        transcriptUrl: run.transcript_public_url ?? null,
        recordingUrl: run.recording_public_url ?? null,
      },
    };
  })
  .get("/api/b/:slug/dashboard", async ({ params, query, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    const range =
      query.range === "7d" || query.range === "30d" ? query.range : "today";
    const timezone = workspace.business.timezone;
    const now = new Date();
    const cutoff =
      range === "today"
        ? startOfDayInTimezone(now, timezone)
        : now.getTime() - (range === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000;

    let runs: DograhWorkflowRun[] = [];
    try {
      const workflowId = await requireTenantWorkflowId(workspace.business.id);
      const result = await dograh.listWorkflowRuns(workflowId, 1, 100);
      runs = result.runs.filter(
        (run) => Date.parse(run.created_at) >= cutoff,
      );
    } catch (error) {
      if (
        !(error instanceof ApiError && error.code === "DOGRAH_WORKFLOW_NOT_FOUND")
      ) {
        throw error;
      }
    }

    const durations = runs
      .map((run) => run.cost_info?.call_duration_seconds)
      .filter((value): value is number => typeof value === "number");
    const totalSeconds = durations.reduce((sum, value) => sum + value, 0);
    const hourly = new Array<number>(24).fill(0);
    for (const run of runs) {
      const hour = hourInTimezone(run.created_at, timezone);
      if (hour >= 0 && hour < 24) hourly[hour] = (hourly[hour] ?? 0) + 1;
    }

    return {
      range,
      callsAnswered: runs.length,
      completedCalls: runs.filter((run) => run.is_completed).length,
      totalSeconds,
      averageSeconds:
        durations.length > 0 ? Math.round(totalSeconds / durations.length) : 0,
      hourly,
      recent: runs.slice(0, 8).map(conversationSummary),
    };
  })
  .get("/api/b/:slug/callbacks", async ({ params, query, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    const { limit, offset } = parseListQuery(query);
    const [rows, members] = await Promise.all([
      db
        .select({
          task: callbackTasks,
          assigneeName: users.name,
        })
        .from(callbackTasks)
        .leftJoin(users, eq(callbackTasks.assignedTo, users.id))
        .where(eq(callbackTasks.businessId, workspace.business.id))
        .orderBy(asc(callbackTasks.promisedAt))
        .limit(limit + 1)
        .offset(offset),
      db
        .select({
          userId: users.id,
          name: users.name,
          role: memberships.role,
        })
        .from(memberships)
        .innerJoin(users, eq(memberships.userId, users.id))
        .where(
          and(
            eq(memberships.businessId, workspace.business.id),
            eq(memberships.status, "active"),
          ),
        )
        .orderBy(asc(users.name)),
    ]);
    const page = paginate(rows, limit);
    return {
      callbacks: page.items.map(({ task, assigneeName }) =>
        callbackView(task, assigneeName),
      ),
      hasMore: page.hasMore,
      limit,
      offset,
      members,
      viewerId: workspace.session.user.id,
      canManage: can(workspace.role, "callbacks.manage"),
    };
  })
  .post(
    "/api/b/:slug/callbacks",
    async ({ body, params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      requirePermission(workspace.role, "callbacks.manage");
      const promisedAt = new Date(body.promisedAt);
      if (Number.isNaN(promisedAt.getTime())) {
        throw new ApiError(
          400,
          "INVALID_PROMISED_AT",
          "Invalid promised-at time.",
        );
      }
      if (body.assignedTo) {
        const [member] = await db
          .select({ userId: memberships.userId })
          .from(memberships)
          .where(
            and(
              eq(memberships.businessId, workspace.business.id),
              eq(memberships.userId, body.assignedTo),
              eq(memberships.status, "active"),
            ),
          )
          .limit(1);
        if (!member) {
          throw new ApiError(
            400,
            "INVALID_ASSIGNEE",
            "The assignee is not an active member of this business.",
          );
        }
      }
      const id = randomUUID();
      const channel = body.contactChannel.trim();
      const contactId = await linkContact(
        workspace.business.id,
        {
          name: body.contactName,
          phone: channel.includes("@") ? null : channel,
          email: channel.includes("@") ? channel : null,
        },
        "manual",
        workspace.session.user.id,
      );
      const [created] = await db
        .insert(callbackTasks)
        .values({
          id,
          businessId: workspace.business.id,
          contactName: body.contactName.trim(),
          contactChannel: channel,
          contactId,
          reason: body.reason.trim(),
          promisedAt,
          assignedTo: body.assignedTo ?? null,
          createdBy: workspace.session.user.id,
        })
        .returning();
      if (!created) {
        throw new ApiError(
          500,
          "CALLBACK_CREATE_FAILED",
          "Could not create the callback.",
        );
      }
      const assigneeName = created.assignedTo
        ? ((
            await db
              .select({ name: users.name })
              .from(users)
              .where(eq(users.id, created.assignedTo))
              .limit(1)
          )[0]?.name ?? null)
        : null;
      await db.insert(auditLogs).values({
        id: randomUUID(),
        businessId: workspace.business.id,
        actorUserId: workspace.session.user.id,
        action: "callback.create",
        targetType: "callback_task",
        targetId: id,
      });
      return { callback: callbackView(created, assigneeName) };
    },
    {
      body: t.Object({
        contactName: t.String({ minLength: 1, maxLength: 120 }),
        contactChannel: t.String({ minLength: 1, maxLength: 160 }),
        reason: t.String({ minLength: 1, maxLength: 1000 }),
        promisedAt: t.String(),
        assignedTo: t.Optional(t.Nullable(t.String())),
      }),
    },
  )
  .patch(
    "/api/b/:slug/callbacks/:callbackId",
    async ({ body, params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      requirePermission(workspace.role, "callbacks.manage");
      const [existing] = await db
        .select()
        .from(callbackTasks)
        .where(
          and(
            eq(callbackTasks.id, params.callbackId),
            eq(callbackTasks.businessId, workspace.business.id),
          ),
        )
        .limit(1);
      if (!existing) {
        throw new ApiError(
          404,
          "CALLBACK_NOT_FOUND",
          "Callback was not found for this business.",
        );
      }
      const now = new Date();
      const updates: Partial<typeof callbackTasks.$inferInsert> = {
        updatedAt: now,
      };
      if (body.assignedTo !== undefined) {
        if (body.assignedTo !== null) {
          const [member] = await db
            .select({ userId: memberships.userId })
            .from(memberships)
            .where(
              and(
                eq(memberships.businessId, workspace.business.id),
                eq(memberships.userId, body.assignedTo),
                eq(memberships.status, "active"),
              ),
            )
            .limit(1);
          if (!member) {
            throw new ApiError(
              400,
              "INVALID_ASSIGNEE",
              "The assignee is not an active member of this business.",
            );
          }
        }
        updates.assignedTo = body.assignedTo;
      }
      if (body.promisedAt !== undefined) {
        const promisedAt = new Date(body.promisedAt);
        if (Number.isNaN(promisedAt.getTime())) {
          throw new ApiError(
            400,
            "INVALID_PROMISED_AT",
            "Invalid promised-at time.",
          );
        }
        updates.promisedAt = promisedAt;
      }
      if (body.status !== undefined) {
        updates.status = body.status;
        updates.closedAt = body.status === "open" ? null : now;
      }
      if (body.attemptNote !== undefined) {
        updates.attempts = existing.attempts.concat([
          { at: now.toISOString(), note: body.attemptNote.trim() },
        ]);
      }
      const [updated] = await db
        .update(callbackTasks)
        .set(updates)
        .where(eq(callbackTasks.id, existing.id))
        .returning();
      if (!updated) {
        throw new ApiError(
          500,
          "CALLBACK_UPDATE_FAILED",
          "Could not update the callback.",
        );
      }
      const assigneeName = updated.assignedTo
        ? ((
            await db
              .select({ name: users.name })
              .from(users)
              .where(eq(users.id, updated.assignedTo))
              .limit(1)
          )[0]?.name ?? null)
        : null;
      await db.insert(auditLogs).values({
        id: randomUUID(),
        businessId: workspace.business.id,
        actorUserId: workspace.session.user.id,
        action: "callback.update",
        targetType: "callback_task",
        targetId: existing.id,
        payload: body as Record<string, unknown>,
      });
      return { callback: callbackView(updated, assigneeName) };
    },
    {
      body: t.Object({
        assignedTo: t.Optional(t.Nullable(t.String())),
        promisedAt: t.Optional(t.String()),
        status: t.Optional(
          t.Union([
            t.Literal("open"),
            t.Literal("spoke"),
            t.Literal("voicemail"),
            t.Literal("dropped"),
          ]),
        ),
        attemptNote: t.Optional(t.String({ minLength: 1, maxLength: 500 })),
      }),
    },
  )
  .get("/api/b/:slug/contacts", async ({ params, query, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    const { limit, offset } = parseListQuery(query);
    const rows = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.businessId, workspace.business.id),
          isNull(contacts.deletedAt),
        ),
      )
      .orderBy(desc(contacts.updatedAt))
      .limit(limit + 1)
      .offset(offset);
    const page = paginate(rows, limit);
    return {
      contacts: page.items.map(contactView),
      hasMore: page.hasMore,
      limit,
      offset,
      canManage: can(workspace.role, "contacts.manage"),
    };
  })
  .post(
    "/api/b/:slug/contacts",
    async ({ body, params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      requirePermission(workspace.role, "contacts.manage");
      const name = normalizeContactField(body.name);
      const phone = normalizeContactField(body.phone);
      const email = normalizeContactField(body.email);
      if (!name && !phone && !email) {
        throw new ApiError(
          400,
          "EMPTY_CONTACT",
          "A contact needs at least a name, phone or email.",
        );
      }
      const id = randomUUID();
      const [created] = await db
        .insert(contacts)
        .values({
          id,
          businessId: workspace.business.id,
          name,
          phone,
          email,
          tags: normalizeTags(body.tags ?? []),
          note: body.note?.trim() ?? "",
          createdBy: workspace.session.user.id,
        })
        .returning();
      if (!created) {
        throw new ApiError(
          500,
          "CONTACT_CREATE_FAILED",
          "Could not create the contact.",
        );
      }
      await db.insert(auditLogs).values({
        id: randomUUID(),
        businessId: workspace.business.id,
        actorUserId: workspace.session.user.id,
        action: "contact.create",
        targetType: "contact",
        targetId: id,
      });
      return { contact: contactView(created) };
    },
    {
      body: t.Object({
        name: t.Optional(t.Nullable(t.String({ maxLength: 120 }))),
        phone: t.Optional(t.Nullable(t.String({ maxLength: 40 }))),
        email: t.Optional(t.Nullable(t.String({ maxLength: 160 }))),
        tags: t.Optional(t.Array(t.String({ maxLength: 40 }), { maxItems: 20 })),
        note: t.Optional(t.String({ maxLength: 2000 })),
      }),
    },
  )
  .post(
    "/api/b/:slug/contacts/import",
    async ({ body, params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      requirePermission(workspace.role, "contacts.manage");
      const rows = body.rows
        .map((row) => ({
          name: normalizeContactField(row.name),
          phone: normalizeContactField(row.phone),
          email: normalizeContactField(row.email),
        }))
        .filter((row) => row.name || row.phone || row.email);
      if (rows.length === 0) {
        throw new ApiError(
          400,
          "EMPTY_IMPORT",
          "No usable rows found. Each row needs a name, phone or email.",
        );
      }
      const created = await db
        .insert(contacts)
        .values(
          rows.map((row) => ({
            id: randomUUID(),
            businessId: workspace.business.id,
            name: row.name,
            phone: row.phone,
            email: row.email,
            source: "import" as const,
            createdBy: workspace.session.user.id,
          })),
        )
        .returning();
      await db.insert(auditLogs).values({
        id: randomUUID(),
        businessId: workspace.business.id,
        actorUserId: workspace.session.user.id,
        action: "contact.import",
        targetType: "contact",
        payload: { count: created.length },
      });
      return { contacts: created.map(contactView) };
    },
    {
      body: t.Object({
        rows: t.Array(
          t.Object({
            name: t.Optional(t.Nullable(t.String({ maxLength: 120 }))),
            phone: t.Optional(t.Nullable(t.String({ maxLength: 40 }))),
            email: t.Optional(t.Nullable(t.String({ maxLength: 160 }))),
          }),
          { minItems: 1, maxItems: 1000 },
        ),
      }),
    },
  )
  .patch(
    "/api/b/:slug/contacts/:contactId",
    async ({ body, params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      requirePermission(workspace.role, "contacts.manage");
      const [existing] = await db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.id, params.contactId),
            eq(contacts.businessId, workspace.business.id),
            isNull(contacts.deletedAt),
          ),
        )
        .limit(1);
      if (!existing) {
        throw new ApiError(
          404,
          "CONTACT_NOT_FOUND",
          "Contact was not found for this business.",
        );
      }
      const updates: Partial<typeof contacts.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (body.name !== undefined) updates.name = normalizeContactField(body.name);
      if (body.phone !== undefined) updates.phone = normalizeContactField(body.phone);
      if (body.email !== undefined) updates.email = normalizeContactField(body.email);
      if (body.tags !== undefined) updates.tags = normalizeTags(body.tags);
      if (body.note !== undefined) updates.note = body.note.trim();
      const nextName = body.name !== undefined ? updates.name : existing.name;
      const nextPhone = body.phone !== undefined ? updates.phone : existing.phone;
      const nextEmail = body.email !== undefined ? updates.email : existing.email;
      if (!nextName && !nextPhone && !nextEmail) {
        throw new ApiError(
          400,
          "EMPTY_CONTACT",
          "A contact needs at least a name, phone or email.",
        );
      }
      const [updated] = await db
        .update(contacts)
        .set(updates)
        .where(eq(contacts.id, existing.id))
        .returning();
      if (!updated) {
        throw new ApiError(
          500,
          "CONTACT_UPDATE_FAILED",
          "Could not update the contact.",
        );
      }
      await db.insert(auditLogs).values({
        id: randomUUID(),
        businessId: workspace.business.id,
        actorUserId: workspace.session.user.id,
        action: "contact.update",
        targetType: "contact",
        targetId: existing.id,
      });
      return { contact: contactView(updated) };
    },
    {
      body: t.Object({
        name: t.Optional(t.Nullable(t.String({ maxLength: 120 }))),
        phone: t.Optional(t.Nullable(t.String({ maxLength: 40 }))),
        email: t.Optional(t.Nullable(t.String({ maxLength: 160 }))),
        tags: t.Optional(t.Array(t.String({ maxLength: 40 }), { maxItems: 20 })),
        note: t.Optional(t.String({ maxLength: 2000 })),
      }),
    },
  )
  .get(
    "/api/b/:slug/contacts/:contactId/activity",
    async ({ params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      const [contact] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(
            eq(contacts.id, params.contactId),
            eq(contacts.businessId, workspace.business.id),
            isNull(contacts.deletedAt),
          ),
        )
        .limit(1);
      if (!contact) {
        throw new ApiError(
          404,
          "CONTACT_NOT_FOUND",
          "Contact was not found for this business.",
        );
      }
      const [contactBookings, contactCallbacks] = await Promise.all([
        db
          .select()
          .from(bookings)
          .where(
            and(
              eq(bookings.businessId, workspace.business.id),
              eq(bookings.contactId, contact.id),
            ),
          )
          .orderBy(desc(bookings.startAt))
          .limit(50),
        db
          .select()
          .from(callbackTasks)
          .where(
            and(
              eq(callbackTasks.businessId, workspace.business.id),
              eq(callbackTasks.contactId, contact.id),
            ),
          )
          .orderBy(desc(callbackTasks.createdAt))
          .limit(50),
      ]);
      return {
        bookings: contactBookings.map((row) => ({
          id: row.id,
          title: row.title,
          startAt: row.startAt.toISOString(),
          durationMinutes: row.durationMinutes,
          status: row.status,
          source: row.source,
        })),
        callbacks: contactCallbacks.map((row) => ({
          id: row.id,
          reason: row.reason,
          status: row.status,
          promisedAt: row.promisedAt.toISOString(),
          source: row.source,
          createdAt: row.createdAt.toISOString(),
        })),
      };
    },
  )
  .delete("/api/b/:slug/contacts/:contactId", async ({ params, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    requirePermission(workspace.role, "contacts.manage");
    const [deleted] = await db
      .update(contacts)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(contacts.id, params.contactId),
          eq(contacts.businessId, workspace.business.id),
          isNull(contacts.deletedAt),
        ),
      )
      .returning();
    if (!deleted) {
      throw new ApiError(
        404,
        "CONTACT_NOT_FOUND",
        "Contact was not found for this business.",
      );
    }
    await db.insert(auditLogs).values({
      id: randomUUID(),
      businessId: workspace.business.id,
      actorUserId: workspace.session.user.id,
      action: "contact.delete",
      targetType: "contact",
      targetId: deleted.id,
    });
    return { ok: true };
  })
  .post("/api/b/:slug/dograh/retry", async ({ params, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    requirePermission(workspace.role, "agent.edit");
    await db.insert(auditLogs).values({
      id: randomUUID(),
      businessId: workspace.business.id,
      actorUserId: workspace.session.user.id,
      action: "dograh.sync.retry",
      targetType: "business_dograh_mapping",
      targetId: workspace.business.id,
    });
    try {
      const result = await synchronizeBusiness(workspace.business.id, {
        force: true,
      });
      return { result };
    } catch (error) {
      dograhApiError(error);
    }
  })
  .post("/api/b/:slug/publish", async ({ params, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    requirePermission(workspace.role, "agent.edit");
    const now = new Date();
    const publishEventId = randomUUID();
    await ensureTenantRows(workspace.business.id);
    await db.transaction(async (tx) => {
      await tx
        .insert(outboxEvents)
        .values({
          id: publishEventId,
          businessId: workspace.business.id,
          eventType: "dograh.widget.publish",
          payload: { businessId: workspace.business.id },
          dedupeKey: `dograh.widget.publish:${workspace.business.id}`,
          availableAt: new Date(now.getTime() + 30_000),
        })
        .onConflictDoNothing();
      await tx.insert(auditLogs).values({
        id: randomUUID(),
        businessId: workspace.business.id,
        actorUserId: workspace.session.user.id,
        action: "business.publish.request",
        targetType: "business",
        targetId: workspace.business.id,
        createdAt: now,
      });
    });
    try {
      const widget = await publishBusinessWidget(workspace.business.id, {
        force: true,
      });
      await db.transaction(async (tx) => {
        await tx
          .update(outboxEvents)
          .set({
            status: "completed",
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(outboxEvents.id, publishEventId));
        await completeStep(tx, workspace.business.id, "review");
        await tx
          .update(businessOnboarding)
          .set({ publishedAt: new Date(), updatedAt: new Date() })
          .where(eq(businessOnboarding.businessId, workspace.business.id));
        const config = await snapshotBusinessConfig(workspace.business.id);
        const [latest] = await tx
          .select({
            version: sql<number>`coalesce(max(${businessConfigVersions.version}), 0)`,
          })
          .from(businessConfigVersions)
          .where(eq(businessConfigVersions.businessId, workspace.business.id));
        await tx.insert(businessConfigVersions).values({
          id: randomUUID(),
          businessId: workspace.business.id,
          version: (latest?.version ?? 0) + 1,
          config,
          publishedBy: workspace.session.user.id,
        });
        await tx.insert(auditLogs).values({
          id: randomUUID(),
          businessId: workspace.business.id,
          actorUserId: workspace.session.user.id,
          action: "business.publish.complete",
          targetType: "business",
          targetId: workspace.business.id,
        });
      });
      return {
        widget: {
          workflowId: widget.workflowId,
          scriptUrl: widget.scriptUrl,
          snippet: widget.snippet,
          settings: widget.tokenSettings,
        },
      };
    } catch (error) {
      dograhApiError(error);
    }
  })
  .get("/api/b/:slug/settings/versions", async ({ params, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    const rows = await db
      .select({
        id: businessConfigVersions.id,
        version: businessConfigVersions.version,
        config: businessConfigVersions.config,
        publishedAt: businessConfigVersions.publishedAt,
        publishedByName: users.name,
      })
      .from(businessConfigVersions)
      .leftJoin(users, eq(users.id, businessConfigVersions.publishedBy))
      .where(eq(businessConfigVersions.businessId, workspace.business.id))
      .orderBy(desc(businessConfigVersions.version));
    return { versions: rows, draft: await snapshotBusinessConfig(workspace.business.id) };
  })
  .get("/api/b/:slug/widget", async ({ params, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    const [mapping] = await db
      .select()
      .from(businessDograhMappings)
      .where(eq(businessDograhMappings.businessId, workspace.business.id))
      .limit(1);
    if (!mapping?.workflowId || mapping.syncState !== "synced") {
      throw new ApiError(
        409,
        "WIDGET_NOT_PUBLISHED",
        "Publish this business before loading its widget.",
      );
    }
    const token = await dograh.getEmbedToken(Number(mapping.workflowId));
    if (!token?.is_active) {
      throw new ApiError(
        409,
        "WIDGET_NOT_PUBLISHED",
        "Publish this business before loading its widget.",
      );
    }
    return {
      workflowId: Number(mapping.workflowId),
      settings: token.settings,
      ...tenantWidgetScript(token.token),
    };
  })
  .get("/api/b/:slug/knowledge", async ({ params, query, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    const { limit, offset } = parseListQuery(query);
    const knowledge = await db
      .select({
        id: businessKnowledge.id,
        kind: businessKnowledge.kind,
        title: businessKnowledge.title,
        filename: businessKnowledge.filename,
        mimeType: businessKnowledge.mimeType,
        retrievalMode: businessKnowledge.retrievalMode,
        remoteDocumentUuid: businessKnowledge.remoteDocumentUuid,
        sourceText: businessKnowledge.sourceText,
        state: businessKnowledge.state,
        active: businessKnowledge.active,
        replacesKnowledgeId: businessKnowledge.replacesKnowledgeId,
        lastError: businessKnowledge.lastError,
        createdAt: businessKnowledge.createdAt,
        updatedAt: businessKnowledge.updatedAt,
      })
      .from(businessKnowledge)
      .where(
        and(
          eq(businessKnowledge.businessId, workspace.business.id),
          ne(businessKnowledge.state, "deleted"),
        ),
      )
      .orderBy(asc(businessKnowledge.createdAt))
      .limit(limit + 1)
      .offset(offset);
    const page = paginate(knowledge, limit);
    return { knowledge: page.items, hasMore: page.hasMore, limit, offset };
  })
  .post(
    "/api/b/:slug/knowledge",
    async ({ body, params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      requirePermission(workspace.role, "knowledge.manage");
      const knowledgeId = randomUUID();
      const now = new Date();
      const replacementId = body.replacementId?.trim() || null;
      let filename = `${knowledgeId}.txt`;
      let mimeType = "text/plain";
      let sourceText: string | null = null;
      let sourceBytes: Uint8Array | null = null;

      if (body.kind === "document") {
        if (!body.file || body.file.size === 0) {
          throw new ApiError(
            400,
            "KNOWLEDGE_FILE_REQUIRED",
            "Choose a document to upload.",
          );
        }
        if (body.file.size > MAX_UPLOAD_BYTES) {
          throw new ApiError(
            413,
            "KNOWLEDGE_FILE_TOO_LARGE",
            `Knowledge documents must be ${MAX_UPLOAD_LABEL} or smaller.`,
          );
        }
        if (!isAllowedDocumentFilename(body.file.name)) {
          throw new ApiError(
            400,
            "KNOWLEDGE_FILE_TYPE_UNSUPPORTED",
            `Supported document types: ${ALLOWED_DOCUMENT_TYPES_LABEL}.`,
          );
        }
        filename = body.file.name;
        mimeType = body.file.type || "application/octet-stream";
        sourceBytes = new Uint8Array(await body.file.arrayBuffer());
        if (!matchesDocumentSignature(filename, sourceBytes)) {
          throw new ApiError(
            400,
            "KNOWLEDGE_FILE_CONTENT_MISMATCH",
            "The file contents do not match its extension.",
          );
        }
      } else if (body.kind === "website_reference") {
        const website = body.websiteUrl?.trim();
        if (!website) {
          throw new ApiError(
            400,
            "WEBSITE_REFERENCE_REQUIRED",
            "Enter a website reference.",
          );
        }
        let parsed: URL;
        try {
          parsed = new URL(website);
        } catch {
          throw new ApiError(
            400,
            "WEBSITE_REFERENCE_INVALID",
            "Use a valid HTTP or HTTPS website reference.",
          );
        }
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          throw new ApiError(
            400,
            "WEBSITE_REFERENCE_INVALID",
            "Use an HTTP or HTTPS website reference.",
          );
        }
        sourceText = [
          `Website reference: ${parsed.toString()}`,
          "This URL is saved as reference text. Vocalonix has not crawled the site.",
          body.text?.trim() || "",
        ]
          .filter(Boolean)
          .join("\n");
        filename = `${knowledgeId}-website-reference.txt`;
      } else {
        sourceText = body.text?.trim() || null;
        if (!sourceText) {
          throw new ApiError(
            400,
            "KNOWLEDGE_TEXT_REQUIRED",
            "Enter knowledge text.",
          );
        }
        filename = `${knowledgeId}-knowledge.txt`;
      }

      await db.transaction(async (tx) => {
        if (replacementId) {
          const [replacement] = await tx
            .select({ id: businessKnowledge.id })
            .from(businessKnowledge)
            .where(
              and(
                eq(businessKnowledge.id, replacementId),
                eq(businessKnowledge.businessId, workspace.business.id),
                eq(businessKnowledge.active, true),
                isNull(businessKnowledge.deletedAt),
              ),
            )
            .limit(1);
          if (!replacement) {
            throw new ApiError(
              404,
              "KNOWLEDGE_NOT_FOUND",
              "The knowledge item to replace was not found.",
            );
          }
        }
        await tx.insert(businessKnowledge).values({
          id: knowledgeId,
          businessId: workspace.business.id,
          kind: body.kind,
          title: body.title.trim(),
          sourceText,
          sourceBytes,
          filename,
          mimeType,
          retrievalMode: body.retrievalMode,
          state: "pending",
          active: false,
          replacesKnowledgeId: replacementId,
          createdAt: now,
          updatedAt: now,
        });
        await tx
          .insert(outboxEvents)
          .values({
            id: randomUUID(),
            businessId: workspace.business.id,
            eventType: "dograh.knowledge.upload",
            payload: { businessId: workspace.business.id, knowledgeId },
            dedupeKey: `dograh.knowledge.upload:${knowledgeId}`,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing();
        await tx.insert(auditLogs).values({
          id: randomUUID(),
          businessId: workspace.business.id,
          actorUserId: workspace.session.user.id,
          action: replacementId
            ? "business.knowledge.replace"
            : "business.knowledge.create",
          targetType: "business_knowledge",
          targetId: knowledgeId,
          payload: { kind: body.kind, title: body.title, replacementId },
          createdAt: now,
        });
      });
      return { knowledgeId };
    },
    {
      body: t.Object({
        kind: t.Union([
          t.Literal("document"),
          t.Literal("text"),
          t.Literal("website_reference"),
        ]),
        title: t.String({ minLength: 1, maxLength: 160 }),
        text: t.Optional(t.String({ maxLength: 100_000 })),
        websiteUrl: t.Optional(t.String({ maxLength: 2000 })),
        file: t.Optional(t.File()),
        retrievalMode: t.Union([
          t.Literal("chunked"),
          t.Literal("full_document"),
        ]),
        replacementId: t.Optional(t.String({ maxLength: 100 })),
      }),
    },
  )
  .delete("/api/b/:slug/knowledge/:knowledgeId", async ({ params, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    requirePermission(workspace.role, "knowledge.manage");
    const now = new Date();
    await db.transaction(async (tx) => {
      const [knowledge] = await tx
        .select()
        .from(businessKnowledge)
        .where(
          and(
            eq(businessKnowledge.id, params.knowledgeId),
            eq(businessKnowledge.businessId, workspace.business.id),
            ne(businessKnowledge.state, "deleted"),
          ),
        )
        .limit(1);
      if (!knowledge) {
        throw new ApiError(
          404,
          "KNOWLEDGE_NOT_FOUND",
          "Knowledge item was not found.",
        );
      }
      await tx
        .update(businessKnowledge)
        .set({
          active: false,
          state: knowledge.remoteDocumentUuid ? "delete_pending" : "deleted",
          deletedAt: now,
          updatedAt: now,
        })
        .where(eq(businessKnowledge.id, knowledge.id));
      if (knowledge.active) {
        await tx
          .insert(outboxEvents)
          .values({
            id: randomUUID(),
            businessId: workspace.business.id,
            eventType: "dograh.workflow.sync",
            payload: {
              businessId: workspace.business.id,
              cleanupKnowledgeId: knowledge.id,
            },
            dedupeKey: `dograh.workflow.cleanup:${knowledge.id}`,
          })
          .onConflictDoNothing();
      } else if (knowledge.remoteDocumentUuid) {
        await tx
          .insert(outboxEvents)
          .values({
            id: randomUUID(),
            businessId: workspace.business.id,
            eventType: "dograh.knowledge.delete",
            payload: {
              businessId: workspace.business.id,
              knowledgeId: knowledge.id,
            },
            dedupeKey: `dograh.knowledge.delete:${knowledge.id}`,
          })
          .onConflictDoNothing();
      }
      await tx.insert(auditLogs).values({
        id: randomUUID(),
        businessId: workspace.business.id,
        actorUserId: workspace.session.user.id,
        action: "business.knowledge.delete",
        targetType: "business_knowledge",
        targetId: knowledge.id,
        createdAt: now,
      });
    });
    return { ok: true };
  })
  .get("/api/b/:slug/overview", async ({ params, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    const [openCallbacks] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(callbackTasks)
      .where(
        and(
          eq(callbackTasks.businessId, workspace.business.id),
          eq(callbackTasks.status, "open"),
        ),
      );
    const [openGaps] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(knowledgeGaps)
      .where(
        and(
          eq(knowledgeGaps.businessId, workspace.business.id),
          eq(knowledgeGaps.status, "open"),
        ),
      );
    return {
      openCallbacks: openCallbacks?.n ?? 0,
      openGaps: openGaps?.n ?? 0,
    };
  })
  .get("/api/b/:slug/bookings", async ({ params, query, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    const from = new Date(String(query.from ?? ""));
    const to = new Date(String(query.to ?? ""));
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new ApiError(
        400,
        "INVALID_RANGE",
        "Provide a valid from/to time range.",
      );
    }
    const [resources, services, rows] = await Promise.all([
      db
        .select()
        .from(bookingResources)
        .where(eq(bookingResources.businessId, workspace.business.id))
        .orderBy(asc(bookingResources.sortOrder), asc(bookingResources.createdAt)),
      db
        .select()
        .from(bookingServices)
        .where(eq(bookingServices.businessId, workspace.business.id))
        .orderBy(asc(bookingServices.createdAt)),
      db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.businessId, workspace.business.id),
            gte(bookings.startAt, from),
            lt(bookings.startAt, to),
          ),
        )
        .orderBy(asc(bookings.startAt)),
    ]);
    return {
      resources,
      services,
      bookings: rows,
      canManage: can(workspace.role, "bookings.manage"),
      canConfigure: can(workspace.role, "bookings.configure"),
    };
  })
  .post(
    "/api/b/:slug/bookings",
    async ({ body, params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      requirePermission(workspace.role, "bookings.manage");
      const startAt = new Date(body.startAt);
      if (Number.isNaN(startAt.getTime())) {
        throw new ApiError(400, "INVALID_START", "Invalid start time.");
      }
      const [resource] = await db
        .select({ id: bookingResources.id })
        .from(bookingResources)
        .where(
          and(
            eq(bookingResources.id, body.resourceId),
            eq(bookingResources.businessId, workspace.business.id),
          ),
        )
        .limit(1);
      if (!resource) {
        throw new ApiError(
          400,
          "INVALID_RESOURCE",
          "That diary column does not belong to this business.",
        );
      }
      await assertNoClash(
        workspace.business.id,
        body.resourceId,
        startAt,
        body.durationMinutes,
        null,
      );
      const id = randomUUID();
      const customerName = body.customerName?.trim() ?? "";
      const customerPhone = body.customerPhone?.trim() ?? "";
      const contactId = await linkContact(
        workspace.business.id,
        { name: customerName, phone: customerPhone },
        "manual",
        workspace.session.user.id,
      );
      const [created] = await db
        .insert(bookings)
        .values({
          id,
          businessId: workspace.business.id,
          resourceId: body.resourceId,
          serviceId: body.serviceId ?? null,
          title: body.title.trim(),
          customerName,
          customerPhone,
          contactId,
          startAt,
          durationMinutes: body.durationMinutes,
          source: body.source ?? "desk",
          price: body.price?.trim() ?? "",
          note: body.note?.trim() ?? "",
          createdBy: workspace.session.user.id,
        })
        .returning();
      if (!created) {
        throw new ApiError(
          500,
          "BOOKING_CREATE_FAILED",
          "Could not create the booking.",
        );
      }
      await db.insert(auditLogs).values({
        id: randomUUID(),
        businessId: workspace.business.id,
        actorUserId: workspace.session.user.id,
        action: "booking.create",
        targetType: "booking",
        targetId: id,
      });
      return { booking: created };
    },
    {
      body: t.Object({
        resourceId: t.String(),
        serviceId: t.Optional(t.Nullable(t.String())),
        title: t.String({ minLength: 1, maxLength: 160 }),
        customerName: t.Optional(t.String({ maxLength: 160 })),
        customerPhone: t.Optional(t.String({ maxLength: 40 })),
        startAt: t.String(),
        durationMinutes: t.Integer({ minimum: 5, maximum: 720 }),
        source: t.Optional(
          t.Union([t.Literal("agent"), t.Literal("desk"), t.Literal("web")]),
        ),
        price: t.Optional(t.String({ maxLength: 80 })),
        note: t.Optional(t.String({ maxLength: 1000 })),
      }),
    },
  )
  .patch(
    "/api/b/:slug/bookings/:bookingId",
    async ({ body, params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      requirePermission(workspace.role, "bookings.manage");
      const [existing] = await db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.id, params.bookingId),
            eq(bookings.businessId, workspace.business.id),
          ),
        )
        .limit(1);
      if (!existing) {
        throw new ApiError(
          404,
          "BOOKING_NOT_FOUND",
          "Booking was not found for this business.",
        );
      }
      const now = new Date();
      const updates: Partial<typeof bookings.$inferInsert> = { updatedAt: now };
      const nextStart = body.startAt ? new Date(body.startAt) : existing.startAt;
      if (body.startAt && Number.isNaN(nextStart.getTime())) {
        throw new ApiError(400, "INVALID_START", "Invalid start time.");
      }
      const nextResource = body.resourceId ?? existing.resourceId;
      if (body.resourceId) {
        const [resource] = await db
          .select({ id: bookingResources.id })
          .from(bookingResources)
          .where(
            and(
              eq(bookingResources.id, body.resourceId),
              eq(bookingResources.businessId, workspace.business.id),
            ),
          )
          .limit(1);
        if (!resource) {
          throw new ApiError(
            400,
            "INVALID_RESOURCE",
            "That diary column does not belong to this business.",
          );
        }
      }
      if (body.startAt || body.resourceId) {
        await assertNoClash(
          workspace.business.id,
          nextResource,
          nextStart,
          existing.durationMinutes,
          existing.id,
        );
        updates.startAt = nextStart;
        updates.resourceId = nextResource;
      }
      if (body.status !== undefined) {
        updates.status = body.status;
        updates.cancelledAt = body.status === "cancelled" ? now : null;
      }
      if (body.note !== undefined) {
        updates.note = body.note.trim();
      }
      if (body.customerName !== undefined || body.customerPhone !== undefined) {
        const nextName =
          body.customerName?.trim() ?? existing.customerName;
        const nextPhone =
          body.customerPhone?.trim() ?? existing.customerPhone;
        updates.customerName = nextName;
        updates.customerPhone = nextPhone;
        updates.contactId = await linkContact(
          workspace.business.id,
          { name: nextName, phone: nextPhone },
          "manual",
          workspace.session.user.id,
        );
      }
      const [updated] = await db
        .update(bookings)
        .set(updates)
        .where(eq(bookings.id, existing.id))
        .returning();
      if (!updated) {
        throw new ApiError(
          500,
          "BOOKING_UPDATE_FAILED",
          "Could not update the booking.",
        );
      }
      await db.insert(auditLogs).values({
        id: randomUUID(),
        businessId: workspace.business.id,
        actorUserId: workspace.session.user.id,
        action: "booking.update",
        targetType: "booking",
        targetId: existing.id,
        payload: body as Record<string, unknown>,
      });
      return { booking: updated };
    },
    {
      body: t.Object({
        startAt: t.Optional(t.String()),
        resourceId: t.Optional(t.String()),
        status: t.Optional(
          t.Union([
            t.Literal("booked"),
            t.Literal("arrived"),
            t.Literal("cancelled"),
            t.Literal("no_show"),
          ]),
        ),
        note: t.Optional(t.String({ maxLength: 1000 })),
        customerName: t.Optional(t.String({ maxLength: 160 })),
        customerPhone: t.Optional(t.String({ maxLength: 40 })),
      }),
    },
  )
  .post(
    "/api/b/:slug/booking-resources",
    async ({ body, params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      requirePermission(workspace.role, "bookings.configure");
      const id = randomUUID();
      const [created] = await db
        .insert(bookingResources)
        .values({
          id,
          businessId: workspace.business.id,
          name: body.name.trim(),
          subtitle: body.subtitle?.trim() ?? "",
          kind: body.kind ?? "person",
          hours: body.hours?.trim() ?? "",
          notes: body.notes?.trim() ?? "",
        })
        .returning();
      if (!created) {
        throw new ApiError(
          500,
          "RESOURCE_CREATE_FAILED",
          "Could not create the diary column.",
        );
      }
      await queueBookingSync(workspace.business.id);
      return { resource: created };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 120 }),
        subtitle: t.Optional(t.String({ maxLength: 120 })),
        kind: t.Optional(t.Union([t.Literal("person"), t.Literal("room")])),
        hours: t.Optional(t.String({ maxLength: 200 })),
        notes: t.Optional(t.String({ maxLength: 500 })),
      }),
    },
  )
  .patch(
    "/api/b/:slug/booking-resources/:resourceId",
    async ({ body, params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      requirePermission(workspace.role, "bookings.configure");
      const [updated] = await db
        .update(bookingResources)
        .set({
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.subtitle !== undefined
            ? { subtitle: body.subtitle.trim() }
            : {}),
          ...(body.hours !== undefined ? { hours: body.hours.trim() } : {}),
          ...(body.notes !== undefined ? { notes: body.notes.trim() } : {}),
          ...(body.active !== undefined ? { active: body.active } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(bookingResources.id, params.resourceId),
            eq(bookingResources.businessId, workspace.business.id),
          ),
        )
        .returning();
      if (!updated) {
        throw new ApiError(
          404,
          "RESOURCE_NOT_FOUND",
          "Diary column was not found for this business.",
        );
      }
      await queueBookingSync(workspace.business.id);
      return { resource: updated };
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
        subtitle: t.Optional(t.String({ maxLength: 120 })),
        hours: t.Optional(t.String({ maxLength: 200 })),
        notes: t.Optional(t.String({ maxLength: 500 })),
        active: t.Optional(t.Boolean()),
      }),
    },
  )
  .post(
    "/api/b/:slug/booking-services",
    async ({ body, params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      requirePermission(workspace.role, "bookings.configure");
      const id = randomUUID();
      const [created] = await db
        .insert(bookingServices)
        .values({
          id,
          businessId: workspace.business.id,
          name: body.name.trim(),
          durationMinutes: body.durationMinutes,
          bufferMinutes: body.bufferMinutes ?? 0,
          price: body.price?.trim() ?? "",
          deposit: body.deposit?.trim() ?? "",
          agentBookable: body.agentBookable ?? true,
        })
        .returning();
      if (!created) {
        throw new ApiError(
          500,
          "SERVICE_CREATE_FAILED",
          "Could not create the service.",
        );
      }
      await queueBookingSync(workspace.business.id);
      return { service: created };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 120 }),
        durationMinutes: t.Integer({ minimum: 5, maximum: 720 }),
        bufferMinutes: t.Optional(t.Integer({ minimum: 0, maximum: 240 })),
        price: t.Optional(t.String({ maxLength: 80 })),
        deposit: t.Optional(t.String({ maxLength: 80 })),
        agentBookable: t.Optional(t.Boolean()),
      }),
    },
  )
  .patch(
    "/api/b/:slug/booking-services/:serviceId",
    async ({ body, params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      requirePermission(workspace.role, "bookings.configure");
      const [updated] = await db
        .update(bookingServices)
        .set({
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.durationMinutes !== undefined
            ? { durationMinutes: body.durationMinutes }
            : {}),
          ...(body.bufferMinutes !== undefined
            ? { bufferMinutes: body.bufferMinutes }
            : {}),
          ...(body.price !== undefined ? { price: body.price.trim() } : {}),
          ...(body.deposit !== undefined
            ? { deposit: body.deposit.trim() }
            : {}),
          ...(body.agentBookable !== undefined
            ? { agentBookable: body.agentBookable }
            : {}),
          ...(body.active !== undefined ? { active: body.active } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(bookingServices.id, params.serviceId),
            eq(bookingServices.businessId, workspace.business.id),
          ),
        )
        .returning();
      if (!updated) {
        throw new ApiError(
          404,
          "SERVICE_NOT_FOUND",
          "Service was not found for this business.",
        );
      }
      await queueBookingSync(workspace.business.id);
      return { service: updated };
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
        durationMinutes: t.Optional(t.Integer({ minimum: 5, maximum: 720 })),
        bufferMinutes: t.Optional(t.Integer({ minimum: 0, maximum: 240 })),
        price: t.Optional(t.String({ maxLength: 80 })),
        deposit: t.Optional(t.String({ maxLength: 80 })),
        agentBookable: t.Optional(t.Boolean()),
        active: t.Optional(t.Boolean()),
      }),
    },
  )
  .get("/api/b/:slug/knowledge-gaps", async ({ params, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    const gaps = await db
      .select({
        id: knowledgeGaps.id,
        question: knowledgeGaps.question,
        agentResponse: knowledgeGaps.agentResponse,
        askCount: knowledgeGaps.askCount,
        status: knowledgeGaps.status,
        lastAskedAt: knowledgeGaps.lastAskedAt,
        createdAt: knowledgeGaps.createdAt,
      })
      .from(knowledgeGaps)
      .where(eq(knowledgeGaps.businessId, workspace.business.id))
      .orderBy(desc(knowledgeGaps.lastAskedAt));
    return {
      gaps,
      canManage: can(workspace.role, "knowledge.manage"),
    };
  })
  .patch(
    "/api/b/:slug/knowledge-gaps/:gapId",
    async ({ body, params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      requirePermission(workspace.role, "knowledge.manage");
      const [existing] = await db
        .select({ id: knowledgeGaps.id })
        .from(knowledgeGaps)
        .where(
          and(
            eq(knowledgeGaps.id, params.gapId),
            eq(knowledgeGaps.businessId, workspace.business.id),
          ),
        )
        .limit(1);
      if (!existing) {
        throw new ApiError(
          404,
          "KNOWLEDGE_GAP_NOT_FOUND",
          "Knowledge gap was not found for this business.",
        );
      }
      const now = new Date();
      const [updated] = await db
        .update(knowledgeGaps)
        .set({
          status: body.status,
          resolvedBy: body.status === "open" ? null : workspace.session.user.id,
          resolvedAt: body.status === "open" ? null : now,
          updatedAt: now,
        })
        .where(eq(knowledgeGaps.id, existing.id))
        .returning({
          id: knowledgeGaps.id,
          question: knowledgeGaps.question,
          agentResponse: knowledgeGaps.agentResponse,
          askCount: knowledgeGaps.askCount,
          status: knowledgeGaps.status,
          lastAskedAt: knowledgeGaps.lastAskedAt,
          createdAt: knowledgeGaps.createdAt,
        });
      if (!updated) {
        throw new ApiError(
          500,
          "KNOWLEDGE_GAP_UPDATE_FAILED",
          "Could not update the knowledge gap.",
        );
      }
      await db.insert(auditLogs).values({
        id: randomUUID(),
        businessId: workspace.business.id,
        actorUserId: workspace.session.user.id,
        action: "knowledge_gap.update",
        targetType: "knowledge_gap",
        targetId: existing.id,
        payload: body as Record<string, unknown>,
      });
      return { gap: updated };
    },
    {
      body: t.Object({
        status: t.Union([
          t.Literal("open"),
          t.Literal("answered"),
          t.Literal("dismissed"),
        ]),
      }),
    },
  )
  .delete("/api/b/:slug", async ({ params, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    requirePermission(workspace.role, "business.delete");
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(businesses)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(businesses.id, workspace.business.id));
      await tx
        .insert(outboxEvents)
        .values({
          id: randomUUID(),
          businessId: workspace.business.id,
          eventType: "dograh.business.offboard",
          payload: { businessId: workspace.business.id },
          dedupeKey: `dograh.business.offboard:${workspace.business.id}`,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();
      await tx.insert(auditLogs).values({
        id: randomUUID(),
        businessId: workspace.business.id,
        actorUserId: workspace.session.user.id,
        action: "business.delete",
        targetType: "business",
        targetId: workspace.business.id,
        createdAt: now,
      });
    });
    return { ok: true };
  });
