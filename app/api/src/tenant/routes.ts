import { randomUUID } from "node:crypto";

import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { normalizeEmail } from "../auth/email";
import { db } from "../db/client";
import {
  auditLogs,
  businessAgentSettings,
  businessDograhMappings,
  businessKnowledge,
  businessOnboarding,
  businesses,
  outboxEvents,
} from "../db/schema";
import {
  DograhSyncError,
  publishBusinessWidget,
  synchronizeBusiness,
  tenantWidgetScript,
} from "../dograh/tenant";
import { dograh } from "../dograh/client";
import { ApiError } from "../errors";
import { requirePermission, requireWorkspace } from "../workspace/context";

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
  .get("/api/b/:slug/knowledge", async ({ params, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    const knowledge = await db
      .select({
        id: businessKnowledge.id,
        kind: businessKnowledge.kind,
        title: businessKnowledge.title,
        filename: businessKnowledge.filename,
        mimeType: businessKnowledge.mimeType,
        retrievalMode: businessKnowledge.retrievalMode,
        remoteDocumentUuid: businessKnowledge.remoteDocumentUuid,
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
      .orderBy(asc(businessKnowledge.createdAt));
    return { knowledge };
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
        if (body.file.size > 10_000_000) {
          throw new ApiError(
            413,
            "KNOWLEDGE_FILE_TOO_LARGE",
            "Knowledge documents must be 10 MB or smaller.",
          );
        }
        filename = body.file.name;
        mimeType = body.file.type || "application/octet-stream";
        sourceBytes = new Uint8Array(await body.file.arrayBuffer());
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
