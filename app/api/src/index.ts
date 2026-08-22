import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";

import { authRoutes } from "./auth/routes";
import { billingRoutes } from "./billing/routes";
import { DograhError } from "./dograh/client";
import { env } from "./env";
import { ApiError } from "./errors";
import { workspaceRoutes } from "./workspace/routes";
import { agentToolRoutes } from "./agent/routes";
import { platformRoutes } from "./platform/routes";
import { reconcileProviderConfiguration } from "./platform/providers";
import { backfillCallRecords } from "./dograh/ingest";
import { reconcileTelephonyConfiguration } from "./platform/telephony";
import { tenantRoutes } from "./tenant/routes";
import { demoRoutes } from "./demo/routes";
import { reconcileDemoAgents } from "./demo/agents";

export const app = new Elysia()
  .use(
    cors({
      origin: env.appOrigins,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["content-type"],
      credentials: true,
    }),
  )
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 422;
      return { error: "Invalid request body.", code: "VALIDATION" };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: "Not found.", code: "NOT_FOUND" };
    }
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
  .use(agentToolRoutes)
  .use(platformRoutes)
  .use(tenantRoutes)
  .use(workspaceRoutes)
  .use(billingRoutes)
  .use(demoRoutes)
  .get("/api/health", () => ({
    status: "ok",
    service: "harkbell-api",
    time: new Date().toISOString(),
  }));

export type App = typeof app;

if (import.meta.main) {
  app.listen(env.port);
  console.log(`Harkbell API listening on http://localhost:${app.server?.port}`);
  // Push whatever provider keys the environment carries into Dograh, so the
  // operator never has to configure models by hand. Deliberately not awaited:
  // the engine may still be starting, and a failed push is reported through
  // the readiness panel rather than blocking the API.
  void reconcileProviderConfiguration().catch((error: unknown) => {
    console.error("Provider reconciliation failed at boot:", error);
  });
  // Same treatment for telephony: refresh the webhook signing key and re-bind
  // any number Telnyx is holding but not delivering calls for. Both failures
  // are invisible in the product — the number simply never rings.
  void reconcileTelephonyConfiguration().catch((error: unknown) => {
    console.error("Telephony reconciliation failed at boot:", error);
  });
  // One reusable demo agent per live trade. Not awaited for the same reason as
  // the others; a visitor who beats it gets one provisioned on demand.
  void reconcileDemoAgents()
    .then(({ reconciled, failed }) => {
      console.log(
        `Demo agents reconciled: ${reconciled} ready${failed ? `, ${failed} failed` : ""}.`,
      );
    })
    .catch((error: unknown) => {
      console.error("Demo agent reconciliation failed at boot:", error);
    });
  // Calls taken before `call_records` existed are invisible to the list and
  // the dashboard until they are copied across. Upserts, so re-running is
  // harmless, and not awaited for the same reason as the reconcilers above.
  void backfillCallRecords()
    .then((count) => {
      if (count > 0) console.log(`Backfilled ${count} call records.`);
    })
    .catch((error: unknown) => {
      console.error("Call record backfill failed at boot:", error);
    });
}
