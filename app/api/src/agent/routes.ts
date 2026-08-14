import { randomUUID } from "node:crypto";

import { and, eq, gte, lt, ne } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { db } from "../db/client";
import {
  auditLogs,
  bookingResources,
  bookingServices,
  bookings,
  businessAgentSettings,
  businesses,
} from "../db/schema";
import { env } from "../env";
import { ApiError } from "../errors";
import { linkContact } from "../tenant/contactLink";
import {
  computeOpenSlots,
  isValidDate,
  isValidTime,
  minutesOfDay,
  resourceIsFree,
  todayInTimeZone,
  weekdayInTimeZone,
  zonedTimeToUtc,
} from "./slots";

function requireAgentKey(headers: Headers): void {
  const provided = headers.get("x-vocalonix-agent-key");
  if (!provided || provided !== env.agentToolSecret) {
    throw new ApiError(401, "UNAUTHORIZED", "A valid agent tool key is required.");
  }
}

interface AgentBookingContext {
  business: typeof businesses.$inferSelect;
  hours: Record<string, { enabled: boolean; open: string; close: string }>;
  resources: (typeof bookingResources.$inferSelect)[];
  services: (typeof bookingServices.$inferSelect)[];
}

async function loadBookingContext(businessId: string): Promise<AgentBookingContext> {
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
    throw new ApiError(404, "NOT_FOUND", "This business was not found.");
  }
  const resources = await db
    .select()
    .from(bookingResources)
    .where(
      and(
        eq(bookingResources.businessId, businessId),
        eq(bookingResources.active, true),
      ),
    );
  const services = await db
    .select()
    .from(bookingServices)
    .where(
      and(
        eq(bookingServices.businessId, businessId),
        eq(bookingServices.active, true),
        eq(bookingServices.agentBookable, true),
      ),
    );
  return {
    business: row.business,
    hours: row.settings.businessHours,
    resources,
    services,
  };
}

function matchService(
  services: (typeof bookingServices.$inferSelect)[],
  requested: string,
): typeof bookingServices.$inferSelect | null {
  const wanted = requested.trim().toLowerCase();
  if (!wanted) return null;
  return (
    services.find((service) => service.name.toLowerCase() === wanted) ??
    services.find(
      (service) =>
        service.name.toLowerCase().includes(wanted) ||
        wanted.includes(service.name.toLowerCase()),
    ) ??
    null
  );
}

function dayHours(
  hours: AgentBookingContext["hours"],
  weekday: string,
): { open: string; close: string } | null {
  const wanted = weekday.toLowerCase();
  for (const [day, value] of Object.entries(hours)) {
    if (day.toLowerCase() === wanted || wanted.startsWith(day.toLowerCase())) {
      return value.enabled ? { open: value.open, close: value.close } : null;
    }
  }
  return null;
}

async function existingBookingsForDay(
  businessId: string,
  date: string,
  timeZone: string,
) {
  const dayStart = zonedTimeToUtc(date, 0, timeZone);
  const dayEnd = zonedTimeToUtc(date, 24 * 60, timeZone);
  const margin = 12 * 60 * 60 * 1000;
  return db
    .select({
      resourceId: bookings.resourceId,
      startAt: bookings.startAt,
      durationMinutes: bookings.durationMinutes,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.businessId, businessId),
        ne(bookings.status, "cancelled"),
        gte(bookings.startAt, new Date(dayStart.getTime() - margin)),
        lt(bookings.startAt, dayEnd),
      ),
    );
}

function servicesSummary(context: AgentBookingContext): string[] {
  return context.services.map((service) => service.name);
}

export const agentToolRoutes = new Elysia()
  .post(
    "/api/agent-tools/:businessId/availability",
    async ({ params, request, body }) => {
      requireAgentKey(request.headers);
      const context = await loadBookingContext(params.businessId);
      if (context.services.length === 0 || context.resources.length === 0) {
        return {
          result: "unavailable",
          message: "Online booking is not set up for this business.",
        };
      }

      const service = matchService(context.services, body.service);
      if (!service) {
        return {
          result: "unknown_service",
          message: "That service is not bookable. Offer one of the listed services.",
          services: servicesSummary(context),
        };
      }

      const timeZone = context.business.timezone;
      const date = body.date?.trim() || todayInTimeZone(timeZone);
      if (!isValidDate(date)) {
        return {
          result: "invalid_date",
          message: "The date must be in YYYY-MM-DD format.",
        };
      }
      const hours = dayHours(context.hours, weekdayInTimeZone(date, timeZone));
      if (!hours) {
        return {
          result: "closed",
          message: `The business is closed on ${weekdayInTimeZone(date, timeZone)}. Offer another day.`,
          service: service.name,
          date,
        };
      }

      const existing = await existingBookingsForDay(
        params.businessId,
        date,
        timeZone,
      );
      const slots = computeOpenSlots({
        date,
        timeZone,
        open: hours.open,
        close: hours.close,
        durationMinutes: service.durationMinutes + service.bufferMinutes,
        resourceIds: context.resources.map((resource) => resource.id),
        existing,
        notBefore: new Date(),
      });

      if (slots.length === 0) {
        return {
          result: "fully_booked",
          message: `No open slots for ${service.name} on ${date}. Offer another day.`,
          service: service.name,
          date,
        };
      }
      return {
        result: "open_slots",
        service: service.name,
        date,
        duration_minutes: service.durationMinutes,
        open_slots: slots,
        message:
          "Offer the caller one or two of these start times (24-hour clock, business local time).",
      };
    },
    {
      body: t.Object({
        service: t.String(),
        date: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/api/agent-tools/:businessId/book",
    async ({ params, request, body }) => {
      requireAgentKey(request.headers);
      const context = await loadBookingContext(params.businessId);
      const service = matchService(context.services, body.service);
      if (!service) {
        return {
          result: "unknown_service",
          message: "That service is not bookable. Check availability first.",
          services: servicesSummary(context),
        };
      }
      const customerName = body.customer_name.trim();
      if (!customerName) {
        return {
          result: "missing_name",
          message: "Ask for the caller's name before booking.",
        };
      }
      const timeZone = context.business.timezone;
      const date = body.date.trim();
      const time = body.time.trim();
      if (!isValidDate(date) || !isValidTime(time)) {
        return {
          result: "invalid_time",
          message: "The date must be YYYY-MM-DD and the time must be 24-hour HH:MM.",
        };
      }

      const startAt = zonedTimeToUtc(date, minutesOfDay(time), timeZone);
      if (startAt < new Date()) {
        return {
          result: "in_the_past",
          message: "That time has already passed. Offer a later slot.",
        };
      }
      const durationMinutes = service.durationMinutes + service.bufferMinutes;
      const existing = await existingBookingsForDay(
        params.businessId,
        date,
        timeZone,
      );
      const resource = context.resources.find((candidate) =>
        resourceIsFree(candidate.id, startAt, durationMinutes, existing),
      );
      if (!resource) {
        return {
          result: "slot_taken",
          message: `${time} on ${date} is no longer free. Check availability again and offer another time.`,
        };
      }

      const id = randomUUID();
      const phone = body.customer_phone?.trim() ?? "";
      const contactId = await linkContact(
        params.businessId,
        { name: customerName, phone },
        "call",
      );
      const [created] = await db
        .insert(bookings)
        .values({
          id,
          businessId: params.businessId,
          resourceId: resource.id,
          serviceId: service.id,
          title: service.name,
          customerName,
          customerPhone: phone,
          contactId,
          startAt,
          durationMinutes: service.durationMinutes,
          status: "booked",
          source: "agent",
          price: service.price,
          note: "",
        })
        .returning();
      await db.insert(auditLogs).values({
        id: randomUUID(),
        businessId: params.businessId,
        actorUserId: null,
        action: "booking.create",
        targetType: "booking",
        targetId: id,
        payload: { source: "agent" },
      });

      return {
        result: "booked",
        booking_id: created!.id,
        confirmation: `Booked: ${service.name} for ${customerName} on ${date} at ${time} with ${resource.name}. Read this back to the caller.`,
      };
    },
    {
      body: t.Object({
        service: t.String(),
        date: t.String(),
        time: t.String(),
        customer_name: t.String(),
        customer_phone: t.Optional(t.String()),
      }),
    },
  );
