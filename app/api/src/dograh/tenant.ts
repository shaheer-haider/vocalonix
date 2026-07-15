import { randomUUID } from "node:crypto";

import { and, eq, isNull, lt, ne, or } from "drizzle-orm";

import { db } from "../db/client";
import {
  businessAgentSettings,
  businessDograhMappings,
  businessKnowledge,
  businesses,
  outboxEvents,
} from "../db/schema";
import { env } from "../env";
import type { DograhManagementClient } from "./client";
import { dograh, DograhError } from "./client";
import {
  tenantDesiredConfiguration,
  type TenantBusinessProfile,
} from "./config";
import {
  classifyDograhFailure,
  type ClassifiedDograhFailure,
} from "./errors";
import type { TenantAgentSettings } from "./types";

const syncLeaseMs = 5 * 60 * 1000;

export class DograhSyncError extends Error {
  constructor(readonly failure: ClassifiedDograhFailure) {
    super(failure.message);
    this.name = "DograhSyncError";
  }
}

export interface TenantSyncResult {
  hash: string;
  noOp: boolean;
  workflowId: number;
  workflowUuid: string | null;
}

function tenantSettings(
  row: typeof businessAgentSettings.$inferSelect,
): TenantAgentSettings {
  return {
    agentName: row.agentName,
    greeting: row.greeting,
    prompt: row.prompt,
    closing: row.closing,
    tone: row.tone,
    voice: row.voice,
    allowInterrupt: row.allowInterrupt,
    escalationGuidance: row.escalationGuidance,
    businessHours: row.businessHours,
    widgetButtonText: row.widgetButtonText,
    widgetColor: row.widgetColor,
    allowedDomains: row.allowedDomains,
  };
}

async function loadTenantConfiguration(businessId: string) {
  await db
    .insert(businessAgentSettings)
    .values({ businessId })
    .onConflictDoNothing();

  const [row] = await db
    .select({
      business: businesses,
      settings: businessAgentSettings,
      mapping: businessDograhMappings,
    })
    .from(businesses)
    .innerJoin(
      businessAgentSettings,
      eq(businessAgentSettings.businessId, businesses.id),
    )
    .innerJoin(
      businessDograhMappings,
      eq(businessDograhMappings.businessId, businesses.id),
    )
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!row) throw new Error("Business Dograh configuration was not found.");

  const documents = await db
    .select({ documentUuid: businessKnowledge.remoteDocumentUuid })
    .from(businessKnowledge)
    .where(
      and(
        eq(businessKnowledge.businessId, businessId),
        eq(businessKnowledge.active, true),
        eq(businessKnowledge.state, "active"),
      ),
    );

  const business: TenantBusinessProfile = {
    id: row.business.id,
    name: row.business.name,
    city: row.business.city,
    country: row.business.country,
    timezone: row.business.timezone,
    vertical: row.business.vertical,
  };

  return {
    business,
    settings: tenantSettings(row.settings),
    mapping: row.mapping,
    documentUuids: documents
      .map((document) => document.documentUuid)
      .filter((value): value is string => Boolean(value)),
  };
}

export function synchronizationDecision(
  mapping: Pick<
    typeof businessDograhMappings.$inferSelect,
    "syncState" | "syncedConfigHash" | "configHash" | "workflowId"
  >,
  desiredHash: string,
  force: boolean,
): "synchronize" | "no-op" | "rejected" {
  if (
    !force &&
    mapping.syncState === "synced" &&
    mapping.syncedConfigHash === desiredHash &&
    mapping.workflowId
  ) {
    return "no-op";
  }
  if (
    !force &&
    mapping.syncState === "rejected" &&
    mapping.configHash === desiredHash
  ) {
    return "rejected";
  }
  return "synchronize";
}

function workflowBusinessId(definition: Record<string, unknown>): string | null {
  const metadata = definition.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const vocalonix = (metadata as Record<string, unknown>).vocalonix;
  if (!vocalonix || typeof vocalonix !== "object" || Array.isArray(vocalonix)) {
    return null;
  }
  const businessId = (vocalonix as Record<string, unknown>).business_id;
  return typeof businessId === "string" ? businessId : null;
}

async function persistSyncFailure(
  businessId: string,
  leaseId: string,
  failure: ClassifiedDograhFailure,
): Promise<void> {
  await db
    .update(businessDograhMappings)
    .set({
      syncState: failure.category === "rejected" ? "rejected" : "failed",
      errorCategory: failure.category,
      lastError: failure.message,
      syncLeaseId: null,
      syncLeaseExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(businessDograhMappings.businessId, businessId),
        eq(businessDograhMappings.syncLeaseId, leaseId),
      ),
    );
}

export async function synchronizeBusiness(
  businessId: string,
  options: {
    client?: DograhManagementClient;
    extraDocumentUuid?: string;
    force?: boolean;
  } = {},
): Promise<TenantSyncResult> {
  const client = options.client ?? dograh;
  const loaded = await loadTenantConfiguration(businessId);
  const documentUuids = options.extraDocumentUuid
    ? [...new Set([...loaded.documentUuids, options.extraDocumentUuid])]
    : loaded.documentUuids;
  const desired = tenantDesiredConfiguration({
    business: loaded.business,
    settings: loaded.settings,
    documentUuids,
  });
  const decision = synchronizationDecision(
    loaded.mapping,
    desired.hash,
    options.force ?? false,
  );

  if (decision === "no-op") {
    return {
      hash: desired.hash,
      noOp: true,
      workflowId: Number(loaded.mapping.workflowId),
      workflowUuid: loaded.mapping.workflowUuid,
    };
  }
  if (decision === "rejected") {
    throw new DograhSyncError({
      category: "rejected",
      message:
        loaded.mapping.lastError ??
        "Dograh rejected this configuration. Change it or retry manually.",
      retryable: false,
    });
  }

  const now = new Date();
  const leaseId = randomUUID();
  const [claimed] = await db
    .update(businessDograhMappings)
    .set({
      configHash: desired.hash,
      syncState: "syncing",
      errorCategory: null,
      lastError: null,
      lastAttemptAt: now,
      syncLeaseId: leaseId,
      syncLeaseExpiresAt: new Date(now.getTime() + syncLeaseMs),
      updatedAt: now,
    })
    .where(
      and(
        eq(businessDograhMappings.businessId, businessId),
        or(
          isNull(businessDograhMappings.syncLeaseExpiresAt),
          lt(businessDograhMappings.syncLeaseExpiresAt, now),
        ),
      ),
    )
    .returning({ businessId: businessDograhMappings.businessId });

  if (!claimed) {
    throw new DograhSyncError({
      category: "unreachable",
      message: "This business is already synchronizing. Try again shortly.",
      retryable: true,
    });
  }

  try {
    let workflowId = loaded.mapping.workflowId
      ? Number(loaded.mapping.workflowId)
      : null;
    let workflowUuid = loaded.mapping.workflowUuid;

    if (workflowId) {
      try {
        const current = await client.getWorkflow(workflowId);
        if (workflowBusinessId(current.workflow_definition) !== businessId) {
          throw new DograhError(
            "The mapped workflow belongs to another Vocalonix business.",
            409,
          );
        }
      } catch (error) {
        if (
          options.force &&
          error instanceof DograhError &&
          error.status === 404
        ) {
          workflowId = null;
          workflowUuid = null;
        } else {
          throw error;
        }
      }
    }
    if (!workflowId) {
      const created = await client.createWorkflow(
        desired.name,
        desired.workflowDefinition,
      );
      workflowId = created.id;
      const createdWorkflow = await client.getWorkflow(workflowId);
      workflowUuid = createdWorkflow.workflow_uuid ?? null;
      await db
        .update(businessDograhMappings)
        .set({
          workflowId: String(workflowId),
          workflowUuid,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(businessDograhMappings.businessId, businessId),
            eq(businessDograhMappings.syncLeaseId, leaseId),
          ),
        );
    }

    await client.updateWorkflow(
      workflowId,
      desired.name,
      desired.workflowDefinition,
      desired.workflowConfigurations,
    );
    await client.publishWorkflow(workflowId);
    const finalWorkflow = await client.getWorkflow(workflowId);
    workflowUuid = finalWorkflow.workflow_uuid ?? workflowUuid;

    await db
      .update(businessDograhMappings)
      .set({
        workflowId: String(workflowId),
        workflowUuid,
        configHash: desired.hash,
        syncedConfigHash: desired.hash,
        syncState: "synced",
        errorCategory: null,
        lastError: null,
        lastSuccessAt: new Date(),
        syncLeaseId: null,
        syncLeaseExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(businessDograhMappings.businessId, businessId),
          eq(businessDograhMappings.syncLeaseId, leaseId),
        ),
      );

    return {
      hash: desired.hash,
      noOp: false,
      workflowId,
      workflowUuid,
    };
  } catch (error) {
    const failure = classifyDograhFailure(error);
    await persistSyncFailure(businessId, leaseId, failure);
    throw new DograhSyncError(failure);
  }
}

function widgetTokenSettings(settings: TenantAgentSettings): Record<string, unknown> {
  return {
    embedMode: "floating",
    position: "bottom-right",
    buttonText: settings.widgetButtonText,
    buttonColor: settings.widgetColor,
    callToActionText: `Start a browser voice conversation with ${settings.agentName}`,
    autoStart: false,
  };
}

export function tenantWidgetScript(token: string): {
  scriptUrl: string;
  snippet: string;
} {
  const scriptUrl =
    `${env.dograhWidgetUrl}/embed/dograh-widget.js` +
    `?token=${encodeURIComponent(token)}` +
    `&environment=${encodeURIComponent(env.nodeEnv)}` +
    `&apiEndpoint=${encodeURIComponent(env.dograhPublicApiUrl)}`;
  return {
    scriptUrl,
    snippet: `<script src="${scriptUrl}" async></script>`,
  };
}

export async function publishBusinessWidget(
  businessId: string,
  options: {
    client?: DograhManagementClient;
    force?: boolean;
  } = {},
) {
  const client = options.client ?? dograh;
  const sync = await synchronizeBusiness(businessId, {
    client,
    force: options.force,
  });
  const loaded = await loadTenantConfiguration(businessId);
  const token = await client.createEmbedToken(
    sync.workflowId,
    widgetTokenSettings(loaded.settings),
    loaded.settings.allowedDomains,
  );
  return {
    ...sync,
    tokenSettings: token.settings,
    allowedDomains: token.allowed_domains ?? loaded.settings.allowedDomains,
    ...tenantWidgetScript(token.token),
  };
}

export async function uploadKnowledgeSource(
  knowledgeId: string,
  client: DograhManagementClient = dograh,
): Promise<void> {
  const [knowledge] = await db
    .select()
    .from(businessKnowledge)
    .where(eq(businessKnowledge.id, knowledgeId))
    .limit(1);
  if (!knowledge || knowledge.deletedAt) return;

  try {
    let documentUuid = knowledge.remoteDocumentUuid;
    let storageKey = knowledge.remoteStorageKey;
    if (!documentUuid) {
      await db
        .update(businessKnowledge)
        .set({ state: "uploading", updatedAt: new Date() })
        .where(eq(businessKnowledge.id, knowledgeId));
      const source =
        knowledge.sourceBytes ??
        (knowledge.sourceText
          ? new TextEncoder().encode(knowledge.sourceText)
          : null);
      if (!source) throw new Error("Knowledge source content is unavailable.");
      const upload = await client.requestUpload(
        knowledge.filename,
        knowledge.mimeType,
        knowledge.businessId,
      );
      await client.uploadBytes(upload.upload_url, source, knowledge.mimeType);
      documentUuid = upload.document_uuid;
      storageKey = upload.s3_key;
      await db
        .update(businessKnowledge)
        .set({
          remoteDocumentUuid: documentUuid,
          remoteStorageKey: storageKey,
          state: "uploading",
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(businessKnowledge.id, knowledgeId));
    }
    if (storageKey) {
      if (!documentUuid) {
        throw new Error("Knowledge upload state is incomplete.");
      }
      await client.processDocument(
        documentUuid,
        storageKey,
        knowledge.retrievalMode,
      );
      await db
        .update(businessKnowledge)
        .set({
          remoteDocumentUuid: documentUuid,
          remoteStorageKey: null,
          state: "processing",
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(businessKnowledge.id, knowledgeId));
    }
  } catch (error) {
    const failure = classifyDograhFailure(error);
    await db
      .update(businessKnowledge)
      .set({
        state: "failed",
        lastError: failure.message,
        updatedAt: new Date(),
      })
      .where(eq(businessKnowledge.id, knowledgeId));
    throw new DograhSyncError(failure);
  }
}

export async function reconcileKnowledge(
  knowledgeId: string,
  client: DograhManagementClient = dograh,
): Promise<"pending" | "completed"> {
  const [knowledge] = await db
    .select()
    .from(businessKnowledge)
    .where(eq(businessKnowledge.id, knowledgeId))
    .limit(1);
  if (!knowledge || knowledge.deletedAt || knowledge.state === "deleted") {
    return "completed";
  }
  if (!knowledge.remoteDocumentUuid) {
    await uploadKnowledgeSource(knowledgeId, client);
    return "pending";
  }

  try {
    const remote = await client.getDocument(knowledge.remoteDocumentUuid);
    if (remote.processing_status === "pending" || remote.processing_status === "processing") {
      return "pending";
    }
    if (remote.processing_status !== "completed") {
      const detail = remote.processing_error?.trim() || "Document processing failed.";
      const failure = classifyDograhFailure(new DograhError(detail, 422));
      await db
        .update(businessKnowledge)
        .set({
          state: "failed",
          lastError: failure.message,
          updatedAt: new Date(),
        })
        .where(eq(businessKnowledge.id, knowledgeId));
      return "completed";
    }

    await synchronizeBusiness(knowledge.businessId, {
      client,
      extraDocumentUuid: knowledge.remoteDocumentUuid,
    });

    await db.transaction(async (tx) => {
      await tx
        .update(businessKnowledge)
        .set({
          state: "active",
          active: true,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(businessKnowledge.id, knowledgeId));

      if (knowledge.replacesKnowledgeId) {
        const [oldKnowledge] = await tx
          .update(businessKnowledge)
          .set({
            state: "delete_pending",
            active: false,
            deletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(businessKnowledge.id, knowledge.replacesKnowledgeId),
              eq(businessKnowledge.businessId, knowledge.businessId),
            ),
          )
          .returning({ id: businessKnowledge.id });
        if (oldKnowledge) {
          await tx
            .insert(outboxEvents)
            .values({
              id: randomUUID(),
              businessId: knowledge.businessId,
              eventType: "dograh.workflow.sync",
              payload: {
                businessId: knowledge.businessId,
                cleanupKnowledgeId: oldKnowledge.id,
              },
              dedupeKey: `dograh.workflow.cleanup:${oldKnowledge.id}`,
            })
            .onConflictDoNothing();
        }
      } else {
        await tx
          .insert(outboxEvents)
          .values({
            id: randomUUID(),
            businessId: knowledge.businessId,
            eventType: "dograh.workflow.sync",
            payload: { businessId: knowledge.businessId },
            dedupeKey: `dograh.workflow.sync:${knowledge.businessId}`,
          })
          .onConflictDoNothing();
      }
    });
    return "completed";
  } catch (error) {
    if (error instanceof DograhSyncError) throw error;
    throw new DograhSyncError(classifyDograhFailure(error));
  }
}

export async function deleteRemoteKnowledge(
  knowledgeId: string,
  client: DograhManagementClient = dograh,
): Promise<void> {
  const [knowledge] = await db
    .select()
    .from(businessKnowledge)
    .where(eq(businessKnowledge.id, knowledgeId))
    .limit(1);
  if (!knowledge || knowledge.state === "deleted") return;
  if (!knowledge.remoteDocumentUuid) {
    await db
      .update(businessKnowledge)
      .set({ state: "deleted", active: false, updatedAt: new Date() })
      .where(eq(businessKnowledge.id, knowledgeId));
    return;
  }

  try {
    await client.deleteDocument(knowledge.remoteDocumentUuid);
    await db
      .update(businessKnowledge)
      .set({
        state: "deleted",
        active: false,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(businessKnowledge.id, knowledgeId));
  } catch (error) {
    if (error instanceof DograhError && error.status === 404) {
      await db
        .update(businessKnowledge)
        .set({ state: "deleted", active: false, lastError: null, updatedAt: new Date() })
        .where(eq(businessKnowledge.id, knowledgeId));
      return;
    }
    const failure = classifyDograhFailure(error);
    await db
      .update(businessKnowledge)
      .set({
        state: "delete_pending",
        active: false,
        lastError: failure.message,
        nextRetryAt: new Date(Date.now() + 60_000),
        updatedAt: new Date(),
      })
      .where(eq(businessKnowledge.id, knowledgeId));
    throw new DograhSyncError(failure);
  }
}

export async function offboardBusiness(
  businessId: string,
  client: DograhManagementClient = dograh,
): Promise<void> {
  const [mapping] = await db
    .select()
    .from(businessDograhMappings)
    .where(eq(businessDograhMappings.businessId, businessId))
    .limit(1);
  const documents = await db
    .select({ id: businessKnowledge.id })
    .from(businessKnowledge)
    .where(
      and(
        eq(businessKnowledge.businessId, businessId),
        ne(businessKnowledge.state, "deleted"),
      ),
    );

  await db
    .update(businessDograhMappings)
    .set({ syncState: "offboarding", updatedAt: new Date() })
    .where(eq(businessDograhMappings.businessId, businessId));

  if (mapping?.workflowId) {
    const workflowId = Number(mapping.workflowId);
    await client.deactivateEmbedToken(workflowId).catch((error: unknown) => {
      if (error instanceof DograhError && error.status === 404) return;
      throw error;
    });
    await client.archiveWorkflow(workflowId).catch((error: unknown) => {
      if (error instanceof DograhError && error.status === 404) return;
      throw error;
    });
  }
  for (const document of documents) {
    await deleteRemoteKnowledge(document.id, client);
  }

  await db
    .update(businessDograhMappings)
    .set({
      syncState: "offboarded",
      errorCategory: null,
      lastError: null,
      offboardedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(businessDograhMappings.businessId, businessId));
}

export async function recoverStuckBusinessSyncs(): Promise<number> {
  const recovered = await db
    .update(businessDograhMappings)
    .set({
      syncState: "failed",
      errorCategory: "unreachable",
      lastError:
        "A previous synchronization stopped before completion. It is ready to retry.",
      syncLeaseId: null,
      syncLeaseExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(businessDograhMappings.syncState, "syncing"),
        lt(businessDograhMappings.syncLeaseExpiresAt, new Date()),
      ),
    )
    .returning({ businessId: businessDograhMappings.businessId });
  return recovered.length;
}
