import { cors } from "@elysiajs/cors";
import { Elysia, t } from "elysia";

import { authRoutes } from "./auth/routes";
import { dograh, DograhError } from "./dograh/client";
import type { AgentSettings } from "./dograh/types";
import {
  defaultAgentSettings,
  ensureWorkflow,
  readSettings,
  saveSettings,
  syncCompletedDocuments,
} from "./dograh/workflow";
import { env } from "./env";
import {
  ALLOWED_DOCUMENT_TYPES_LABEL,
  isAllowedDocumentFilename,
} from "./uploads";
import { ApiError } from "./errors";
import { workspaceRoutes } from "./workspace/routes";
import { tenantRoutes } from "./tenant/routes";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function validateSettings(settings: AgentSettings): void {
  const required: Array<[keyof AgentSettings, number]> = [
    ["agentName", 80],
    ["businessName", 120],
    ["greeting", 500],
    ["prompt", 4_000],
    ["closing", 500],
    ["widgetButtonText", 80],
    ["widgetColor", 20],
  ];

  for (const [key, max] of required) {
    const value = settings[key];
    if (typeof value !== "string" || !value.trim()) {
      throw new DograhError(`${key} is required`, 400);
    }
    if (value.length > max) {
      throw new DograhError(`${key} must be ${max} characters or fewer`, 400);
    }
  }

  if (!/^#[0-9a-f]{6}$/i.test(settings.widgetColor)) {
    throw new DograhError("widgetColor must be a six-digit hex color", 400);
  }
}

function widgetSettings(settings: AgentSettings): Record<string, unknown> {
  return {
    embedMode: "inline",
    containerId: "dograh-inline-container",
    buttonText: settings.widgetButtonText,
    buttonColor: settings.widgetColor,
    callToActionText: `Speak with ${settings.agentName}`,
    size: "medium",
    autoStart: false,
  };
}

async function widgetPayload() {
  const workflow = await ensureWorkflow();
  const settings = readSettings(workflow);
  const token = await dograh.createEmbedToken(workflow.id, widgetSettings(settings));
  const scriptUrl =
    `${env.dograhWidgetUrl}/embed/dograh-widget.js` +
    `?token=${encodeURIComponent(token.token)}` +
    `&environment=local` +
    `&apiEndpoint=${encodeURIComponent(env.dograhPublicApiUrl)}`;
  const snippet = [
    '<div id="dograh-inline-container"></div>',
    `<script src="${scriptUrl}" async></script>`,
  ].join("\n");

  return {
    workflowId: workflow.id,
    scriptUrl,
    snippet,
    settings: token.settings,
  };
}

export const app = new Elysia()
  .use(
    cors({
      origin: env.appOrigins,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["content-type"],
      credentials: true,
    }),
  )
  .onError(({ error, set }) => {
    if (error instanceof ApiError) {
      set.status = error.status;
      return { error: error.message, code: error.code };
    }
    if (error instanceof DograhError) {
      set.status = error.status >= 500 ? 502 : error.status;
      return { error: error.message };
    }
    console.error(error);
    set.status = 500;
    return { error: "Unexpected server error" };
  })
  .use(authRoutes)
  .use(tenantRoutes)
  .use(workspaceRoutes)
  .get("/api/health", () => ({
    status: "ok",
    service: "vocalonix-api",
    time: new Date().toISOString(),
  }))
  .get("/api/dograh/status", async () => {
    const health = await dograh.health();
    const workflow = await ensureWorkflow();
    return {
      connected: true,
      health,
      workflow: {
        id: workflow.id,
        name: workflow.name,
        status: workflow.status,
      },
    };
  })
  .get("/api/agent", async () => {
    const workflow = await ensureWorkflow();
    return {
      workflow: {
        id: workflow.id,
        name: workflow.name,
        status: workflow.status,
      },
      settings: readSettings(workflow),
      defaults: defaultAgentSettings,
    };
  })
  .put(
    "/api/agent",
    async ({ body }) => {
      validateSettings(body);
      const workflow = await saveSettings(body);
      await dograh.createEmbedToken(workflow.id, widgetSettings(body));
      return {
        workflow: {
          id: workflow.id,
          name: workflow.name,
          status: workflow.status,
        },
        settings: readSettings(workflow),
      };
    },
    {
      body: t.Object({
        agentName: t.String(),
        businessName: t.String(),
        greeting: t.String(),
        prompt: t.String(),
        closing: t.String(),
        allowInterrupt: t.Boolean(),
        widgetButtonText: t.String(),
        widgetColor: t.String(),
      }),
    },
  )
  .get("/api/agent/widget", widgetPayload)
  .get("/api/knowledge", async () => {
    const response = await dograh.listDocuments();
    await syncCompletedDocuments(response.documents);
    return response;
  })
  .post(
    "/api/knowledge",
    async ({ body }) => {
      const { file } = body;
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new DograhError("File size must be 5MB or less", 400);
      }
      if (!isAllowedDocumentFilename(file.name)) {
        throw new DograhError(
          `Supported file types: ${ALLOWED_DOCUMENT_TYPES_LABEL}`,
          400,
        );
      }

      const upload = await dograh.requestUpload(
        file.name,
        file.type || "application/octet-stream",
      );
      await dograh.uploadFile(upload.upload_url, file);
      const document = await dograh.processDocument(
        upload.document_uuid,
        upload.s3_key,
        body.retrievalMode ?? "full_document",
      );
      return { document };
    },
    {
      body: t.Object({
        file: t.File(),
        retrievalMode: t.Optional(
          t.Union([t.Literal("full_document"), t.Literal("chunked")]),
        ),
      }),
    },
  )
  .delete("/api/knowledge/:documentUuid", async ({ params }) => {
    await dograh.deleteDocument(params.documentUuid);
    const documents = await dograh.listDocuments();
    await syncCompletedDocuments(documents.documents);
    return { ok: true };
  });

export type App = typeof app;

if (import.meta.main) {
  app.listen(env.port);
  console.log(`Vocalonix API listening on http://localhost:${app.server?.port}`);
}
