import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { db } from "../db/client";
import { demoSessions } from "../db/schema";
import { dograh } from "../dograh/client";
import { env } from "../env";
import { provisionDemoWorkflow } from "./workflow";
import { getVertical, VERTICALS } from "../verticals";

function clientInfo(request: Request) {
  const headers = request.headers;
  return {
    ipAddress: headers.get("x-forwarded-for") ?? headers.get("x-real-ip") ?? null,
    userAgent: headers.get("user-agent") ?? null,
    referrer: headers.get("referer") ?? null,
  };
}

export const demoRoutes = new Elysia({ prefix: "/api" })
  .get(
    "/dograh/health",
    async () => {
      let health: Record<string, unknown> | null = null;
      let connected = false;
      try {
        health = await dograh.health();
        connected = true;
      } catch {
        connected = false;
      }

      return {
        connected,
        turnEnabled: connected && health ? Boolean(health.turn_enabled) : false,
        health,
      };
    },
  )
  .get("/verticals", () => {
    return {
      verticals: VERTICALS.map((v) => ({
        slug: v.slug,
        label: v.label,
        status: v.status,
        icon: v.icon,
        serviceOptions: v.serviceOptions,
        intakeFields: v.intakeFields,
        defaultServices: v.defaultServices,
        defaultGreeting: v.defaultGreeting,
        tone: v.tone,
        suggestedCallerScripts: v.suggestedCallerScripts,
        emailCaseStudy: v.emailCaseStudy,
        missedCallValue: v.missedCallValue,
      })),
    };
  })
  .post(
    "/demo/sessions",
    async ({ body, request }) => {
      const vertical = getVertical(body.vertical);
      if (!vertical || vertical.status !== "live") {
        throw new Error("Invalid or unavailable vertical.");
      }

      const info = clientInfo(request);
      const id = randomUUID().replace(/-/g, "");
      const [session] = await db
        .insert(demoSessions)
        .values({
          id,
          vertical: body.vertical,
          services: vertical.defaultServices,
          ipAddress: info.ipAddress,
          userAgent: info.userAgent,
          referrer: info.referrer,
        })
        .returning({ id: demoSessions.id });

      return { session };
    },
    {
      body: t.Object({
        vertical: t.String({ minLength: 1 }),
      }),
    },
  )
  .patch(
    "/demo/sessions/:id",
    async ({ params, body, request }) => {
      const { id } = params;
      const existing = await db
        .select({ id: demoSessions.id, status: demoSessions.status })
        .from(demoSessions)
        .where(eq(demoSessions.id, id))
        .limit(1);

      if (!existing.length) {
        throw new Error("Demo session not found.");
      }

      const info = clientInfo(request);
      const update: Partial<typeof demoSessions.$inferInsert> = {
        updatedAt: new Date(),
        ipAddress: info.ipAddress,
        userAgent: info.userAgent,
        referrer: info.referrer,
      };

      if (body.businessName !== undefined) update.businessName = body.businessName.trim();
      if (body.city !== undefined) update.city = body.city?.trim() || null;
      if (body.services !== undefined) update.services = body.services;
      if (body.bookingTool !== undefined) update.bookingTool = body.bookingTool?.trim() || null;
      if (body.verticalAnswers !== undefined) update.verticalAnswers = body.verticalAnswers;
      if (body.fullName !== undefined) update.fullName = body.fullName?.trim() || null;
      if (body.email !== undefined) update.email = body.email?.trim().toLowerCase() || null;
      if (body.phone !== undefined) update.phone = body.phone?.trim() || null;
      if (body.demoMode !== undefined) update.demoMode = body.demoMode;
      if (body.voice !== undefined) update.voice = body.voice?.trim().toLowerCase() || null;

      if (body.status !== undefined) update.status = body.status;

      const [session] = await db
        .update(demoSessions)
        .set(update)
        .where(eq(demoSessions.id, id))
        .returning({ id: demoSessions.id });

      return { session };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        businessName: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
        city: t.Optional(t.String({ maxLength: 120 })),
        services: t.Optional(t.Array(t.String({ minLength: 1 }))),
        bookingTool: t.Optional(t.String({ maxLength: 120 })),
        verticalAnswers: t.Optional(t.Record(t.String(), t.Unknown())),
        fullName: t.Optional(t.String({ maxLength: 120 })),
        email: t.Optional(t.String({ format: "email" })),
        phone: t.Optional(t.String({ maxLength: 40 })),
        demoMode: t.Optional(t.Union([t.Literal("browser"), t.Literal("phone")])),
        voice: t.Optional(t.String({ maxLength: 40 })),
        status: t.Optional(
          t.Union([
            t.Literal("intake_started"),
            t.Literal("intake_completed"),
            t.Literal("call_started"),
            t.Literal("call_ended"),
            t.Literal("feedback_submitted"),
          ]),
        ),
      }),
    },
  )
  .post(
    "/demo/sessions/:id/start",
    async ({ params }) => {
      const { id } = params;
      const [session] = await db
        .select()
        .from(demoSessions)
        .where(eq(demoSessions.id, id))
        .limit(1);

      if (!session) {
        throw new Error("Demo session not found.");
      }

      const vertical = getVertical(session.vertical);
      if (!vertical) {
        throw new Error("Invalid vertical.");
      }

      const services = session.services.length ? session.services : vertical.defaultServices;

      const workflow = await provisionDemoWorkflow({
        sessionId: id,
        businessName: session.businessName || `${vertical.label} demo`,
        city: session.city,
        country: "US",
        timezone: "America/New_York",
        vertical: session.vertical,
        services,
        verticalAnswers: session.verticalAnswers,
        voice: session.voice,
        agentName: "Ava",
      });

      await db
        .update(demoSessions)
        .set({
          workflowId: workflow.workflowId,
          status: "call_started",
          updatedAt: new Date(),
        })
        .where(eq(demoSessions.id, id));

      const verticalConfig = getVertical(session.vertical);

      return {
        workflowId: workflow.workflowId,
        scriptUrl: workflow.scriptUrl,
        token: workflow.embedToken,
        apiEndpoint: env.dograhPublicApiUrl,
        durationSeconds: 60,
        suggestedScripts: verticalConfig?.suggestedCallerScripts ?? [],
        agentName: "Ava",
      };
    },
    {
      params: t.Object({ id: t.String() }),
    },
  )
  .post(
    "/demo/sessions/:id/end",
    async ({ params, body }) => {
      const { id } = params;
      const existing = await db
        .select({ id: demoSessions.id })
        .from(demoSessions)
        .where(eq(demoSessions.id, id))
        .limit(1);

      if (!existing.length) {
        throw new Error("Demo session not found.");
      }

      await db
        .update(demoSessions)
        .set({
          status: "call_ended",
          durationSeconds: body.durationSeconds ?? null,
          updatedAt: new Date(),
        })
        .where(eq(demoSessions.id, id));

      return { ok: true };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        durationSeconds: t.Optional(t.Number({ minimum: 0 })),
      }),
    },
  )
  .post(
    "/demo/sessions/:id/feedback",
    async ({ params, body }) => {
      const { id } = params;
      const existing = await db
        .select({ id: demoSessions.id })
        .from(demoSessions)
        .where(eq(demoSessions.id, id))
        .limit(1);

      if (!existing.length) {
        throw new Error("Demo session not found.");
      }

      const outcome = body.outcome ?? (body.feedbackScore && body.feedbackScore >= 4 ? "positive" : "neutral");

      await db
        .update(demoSessions)
        .set({
          status: "feedback_submitted",
          feedbackScore: body.feedbackScore ?? null,
          feedbackChips: body.feedbackChips ?? [],
          feedbackText: body.feedbackText?.trim() || null,
          outcome: outcome,
          updatedAt: new Date(),
        })
        .where(eq(demoSessions.id, id));

      return { ok: true, outcome };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        feedbackScore: t.Optional(t.Number({ minimum: 1, maximum: 5 })),
        feedbackChips: t.Optional(t.Array(t.String({ minLength: 1 }))),
        feedbackText: t.Optional(t.String({ maxLength: 2000 })),
        outcome: t.Optional(
          t.Union([
            t.Literal("positive"),
            t.Literal("neutral"),
            t.Literal("negative"),
            t.Literal("abandoned"),
          ]),
        ),
      }),
    },
  );
