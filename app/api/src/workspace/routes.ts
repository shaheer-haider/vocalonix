import { randomBytes, randomUUID } from "node:crypto";

import { and, desc, eq, gt, isNull, lte, ne } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { hashAuthToken, normalizeEmail, sendEmail } from "../auth/email";
import { db } from "../db/client";
import {
  auditLogs,
  businessAgentSettings,
  businessDograhMappings,
  businessOnboarding,
  businesses,
  invitations,
  memberships,
  outboxEvents,
  users,
  type Role,
} from "../db/schema";
import { env } from "../env";
import { ApiError } from "../errors";
import {
  requirePermission,
  requireSession,
  requireWorkspace,
} from "./context";
import { canManageRole } from "./permissions";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const invitationTtlMs = 7 * 24 * 60 * 60 * 1000;

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function pgErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  if ("code" in error && typeof error.code === "string") return error.code;
  return "cause" in error ? pgErrorCode(error.cause) : null;
}

function initialFor(name: string): string {
  return (name.trim()[0] ?? "V").toUpperCase();
}

function requireValidSlug(slug: string): void {
  if (!slugPattern.test(slug)) {
    throw new ApiError(
      400,
      "INVALID_SLUG",
      "Use lowercase letters, numbers, and single hyphens for the slug.",
    );
  }
}

function invitationState(invitation: {
  acceptedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
}): "valid" | "expired" | "revoked" | "accepted" {
  if (invitation.acceptedAt) return "accepted";
  if (invitation.revokedAt) return "revoked";
  if (invitation.expiresAt <= new Date()) return "expired";
  return "valid";
}

function invitePreviewUrl(token: string): string {
  return new URL(`/invite/${token}`, env.appOrigin).toString();
}

function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendInvitationEmail(input: {
  businessName: string;
  email: string;
  inviterName: string;
  role: Role;
  token: string;
}): Promise<void> {
  const link = invitePreviewUrl(input.token);
  const inviterName = escapeHtml(input.inviterName);
  const businessName = escapeHtml(input.businessName);
  await sendEmail({
    to: input.email,
    subject: `You're invited to ${input.businessName} on Vocalonix`,
    text: `${input.inviterName} invited you to join ${input.businessName} as ${input.role}. Accept: ${link}`,
    html: `<p>${inviterName} invited you to join <strong>${businessName}</strong> as ${input.role}.</p><p><a href="${link}">Accept invitation</a></p>`,
  });
}

async function ensureAnotherOwner(
  businessId: string,
  targetUserId: string,
): Promise<void> {
  const [otherOwner] = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.businessId, businessId),
        eq(memberships.status, "active"),
        eq(memberships.role, "Owner"),
        ne(memberships.userId, targetUserId),
      ),
    )
    .limit(1);

  if (!otherOwner) {
    throw new ApiError(
      409,
      "LAST_OWNER",
      "A workspace must keep at least one active Owner.",
    );
  }
}

export const workspaceRoutes = new Elysia()
  .get("/api/businesses", async ({ request }) => {
    const session = await requireSession(request.headers);
    const rows = await db
      .select({
        id: businesses.id,
        slug: businesses.slug,
        name: businesses.name,
        initial: businesses.initial,
        city: businesses.city,
        country: businesses.country,
        timezone: businesses.timezone,
        role: memberships.role,
        joinedAt: memberships.joinedAt,
      })
      .from(memberships)
      .innerJoin(businesses, eq(memberships.businessId, businesses.id))
      .where(
        and(
          eq(memberships.userId, session.user.id),
          eq(memberships.status, "active"),
          isNull(businesses.deletedAt),
        ),
      )
      .orderBy(desc(memberships.joinedAt));

    return { businesses: rows };
  })
  .post(
    "/api/businesses",
    async ({ body, request }) => {
      const session = await requireSession(request.headers);
      const slug = body.slug.trim().toLowerCase();
      const name = body.name.trim();
      requireValidSlug(slug);
      if (name.length < 2) {
        throw new ApiError(
          400,
          "INVALID_BUSINESS_NAME",
          "Enter a business name with at least two characters.",
        );
      }
      const businessId = randomUUID();
      const now = new Date();

      try {
        const created = await db.transaction(async (tx) => {
          const [business] = await tx
            .insert(businesses)
            .values({
              id: businessId,
              slug,
              name,
              initial: initialFor(name),
              country: body.country?.toUpperCase() ?? "US",
              timezone: body.timezone ?? "America/New_York",
              city: body.city?.trim() || null,
              contactEmail: body.contactEmail
                ? normalizeEmail(body.contactEmail)
                : null,
              vertical: body.vertical?.trim() || null,
              locations: body.locations?.trim() || null,
              createdBy: session.user.id,
              createdAt: now,
              updatedAt: now,
            })
            .returning({
              id: businesses.id,
              slug: businesses.slug,
              name: businesses.name,
              initial: businesses.initial,
              city: businesses.city,
              country: businesses.country,
              timezone: businesses.timezone,
            });
          if (!business) {
            throw new ApiError(
              500,
              "BUSINESS_CREATE_FAILED",
              "Unable to create the workspace.",
            );
          }

          await tx.insert(memberships).values({
            userId: session.user.id,
            businessId,
            role: "Owner",
            status: "active",
            joinedAt: now,
          });
          await tx.insert(businessDograhMappings).values({
            businessId,
            syncState: "pending",
            createdAt: now,
            updatedAt: now,
          });
          await tx.insert(businessAgentSettings).values({
            businessId,
            createdAt: now,
            updatedAt: now,
          });
          await tx.insert(businessOnboarding).values({
            businessId,
            createdAt: now,
            updatedAt: now,
          });
          await tx.insert(auditLogs).values({
            id: randomUUID(),
            businessId,
            actorUserId: session.user.id,
            action: "business.create",
            targetType: "business",
            targetId: businessId,
            payload: { slug, name },
            createdAt: now,
          });
          await tx.insert(outboxEvents).values({
            id: randomUUID(),
            businessId,
            eventType: "dograh.workflow.ensure",
            payload: { businessId },
            status: "pending",
            dedupeKey: `dograh.workflow.ensure:${businessId}`,
            availableAt: now,
            createdAt: now,
            updatedAt: now,
          });
          return { ...business, role: "Owner" as const };
        });

        return { business: created };
      } catch (error) {
        if (pgErrorCode(error) === "23505") {
          throw new ApiError(409, "SLUG_TAKEN", "This slug is already taken.");
        }
        throw error;
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2, maxLength: 120 }),
        slug: t.String({ minLength: 3, maxLength: 80 }),
        country: t.Optional(t.String({ minLength: 2, maxLength: 2 })),
        timezone: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
        city: t.Optional(t.String({ maxLength: 120 })),
        contactEmail: t.Optional(t.String({ format: "email" })),
        vertical: t.Optional(t.String({ maxLength: 80 })),
        locations: t.Optional(t.String({ maxLength: 80 })),
      }),
    },
  )
  .get("/api/b/:slug", async ({ params, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    return {
      business: {
        id: workspace.business.id,
        slug: workspace.business.slug,
        name: workspace.business.name,
        initial: workspace.business.initial,
        city: workspace.business.city,
        country: workspace.business.country,
        timezone: workspace.business.timezone,
        role: workspace.role,
      },
    };
  })
  .get("/api/b/:slug/team", async ({ params, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    requirePermission(workspace.role, "team.manage");
    const members = await db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        role: memberships.role,
        joinedAt: memberships.joinedAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.businessId, workspace.business.id),
          eq(memberships.status, "active"),
        ),
      )
      .orderBy(desc(memberships.joinedAt));
    const pendingInvitations = await db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
        lastSentAt: invitations.lastSentAt,
      })
      .from(invitations)
      .where(
        and(
          eq(invitations.businessId, workspace.business.id),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(invitations.createdAt));

    return { members, invitations: pendingInvitations };
  })
  .post(
    "/api/b/:slug/invitations",
    async ({ body, params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      requirePermission(workspace.role, "team.manage");
      const inviteRole = body.role as Role;
      if (!canManageRole(workspace.role, inviteRole)) {
        throw new ApiError(
          403,
          "ROLE_NOT_MANAGEABLE",
          "You cannot invite someone into that role.",
        );
      }

      const email = normalizeEmail(body.email);
      const [activeMember] = await db
        .select({ userId: users.id })
        .from(users)
        .innerJoin(memberships, eq(memberships.userId, users.id))
        .where(
          and(
            eq(users.email, email),
            eq(memberships.businessId, workspace.business.id),
            eq(memberships.status, "active"),
          ),
        )
        .limit(1);
      if (activeMember) {
        throw new ApiError(
          409,
          "ALREADY_MEMBER",
          "This person is already an active member.",
        );
      }

      const [existingInvite] = await db
        .select({ id: invitations.id })
        .from(invitations)
        .where(
          and(
            eq(invitations.businessId, workspace.business.id),
            eq(invitations.email, email),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
            gt(invitations.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (existingInvite) {
        throw new ApiError(
          409,
          "INVITATION_PENDING",
          "This person already has a pending invitation.",
        );
      }

      const token = randomToken();
      const invitationId = randomUUID();
      const now = new Date();
      try {
        await db.transaction(async (tx) => {
          await tx
            .update(invitations)
            .set({ revokedAt: now })
            .where(
              and(
                eq(invitations.businessId, workspace.business.id),
                eq(invitations.email, email),
                isNull(invitations.acceptedAt),
                isNull(invitations.revokedAt),
                lte(invitations.expiresAt, now),
              ),
            );
          await tx.insert(invitations).values({
            id: invitationId,
            businessId: workspace.business.id,
            email,
            role: inviteRole,
            invitedBy: workspace.session.user.id,
            tokenHash: hashAuthToken(token),
            expiresAt: new Date(Date.now() + invitationTtlMs),
            createdAt: now,
            lastSentAt: now,
          });
          await tx.insert(auditLogs).values({
            id: randomUUID(),
            businessId: workspace.business.id,
            actorUserId: workspace.session.user.id,
            action: "team.invite",
            targetType: "invitation",
            targetId: invitationId,
            payload: { email, role: inviteRole },
            createdAt: now,
          });
        });
      } catch (error) {
        if (pgErrorCode(error) === "23505") {
          throw new ApiError(
            409,
            "INVITATION_PENDING",
            "This person already has a pending invitation.",
          );
        }
        throw error;
      }

      await sendInvitationEmail({
        businessName: workspace.business.name,
        email,
        inviterName: workspace.session.user.name,
        role: inviteRole,
        token,
      });

      return {
        invitation: {
          id: invitationId,
          email,
          role: inviteRole,
          previewUrl: env.isProduction ? null : invitePreviewUrl(token),
        },
      };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        role: t.Union([
          t.Literal("Owner"),
          t.Literal("Admin"),
          t.Literal("Manager"),
          t.Literal("Staff"),
          t.Literal("Viewer"),
        ]),
      }),
    },
  )
  .post(
    "/api/b/:slug/invitations/:invitationId/revoke",
    async ({ params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      requirePermission(workspace.role, "team.manage");
      const revoked = await db.transaction(async (tx) => {
        const [invitation] = await tx
          .update(invitations)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(invitations.id, params.invitationId),
              eq(invitations.businessId, workspace.business.id),
              isNull(invitations.acceptedAt),
              isNull(invitations.revokedAt),
            ),
          )
          .returning({
            id: invitations.id,
            email: invitations.email,
            role: invitations.role,
          });
        if (invitation) {
          await tx.insert(auditLogs).values({
            id: randomUUID(),
            businessId: workspace.business.id,
            actorUserId: workspace.session.user.id,
            action: "team.invite.revoke",
            targetType: "invitation",
            targetId: invitation.id,
            payload: { email: invitation.email, role: invitation.role },
          });
        }
        return invitation;
      });
      if (!revoked) {
        throw new ApiError(
          404,
          "INVITATION_NOT_FOUND",
          "Pending invitation not found.",
        );
      }
      return { success: true };
    },
  )
  .post(
    "/api/b/:slug/invitations/:invitationId/resend",
    async ({ params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      requirePermission(workspace.role, "team.manage");
      const token = randomToken();
      const updated = await db.transaction(async (tx) => {
        const [invitation] = await tx
          .update(invitations)
          .set({
            tokenHash: hashAuthToken(token),
            expiresAt: new Date(Date.now() + invitationTtlMs),
            lastSentAt: new Date(),
          })
          .where(
            and(
              eq(invitations.id, params.invitationId),
              eq(invitations.businessId, workspace.business.id),
              isNull(invitations.acceptedAt),
              isNull(invitations.revokedAt),
            ),
          )
          .returning({
            id: invitations.id,
            email: invitations.email,
            role: invitations.role,
          });
        if (invitation) {
          await tx.insert(auditLogs).values({
            id: randomUUID(),
            businessId: workspace.business.id,
            actorUserId: workspace.session.user.id,
            action: "team.invite.resend",
            targetType: "invitation",
            targetId: invitation.id,
            payload: { email: invitation.email, role: invitation.role },
          });
        }
        return invitation;
      });
      if (!updated) {
        throw new ApiError(
          404,
          "INVITATION_NOT_FOUND",
          "Pending invitation not found.",
        );
      }
      await sendInvitationEmail({
        businessName: workspace.business.name,
        email: updated.email,
        inviterName: workspace.session.user.name,
        role: updated.role as Role,
        token,
      });
      return {
        success: true,
        previewUrl: env.isProduction ? null : invitePreviewUrl(token),
      };
    },
  )
  .patch(
    "/api/b/:slug/team/:userId",
    async ({ body, params, request }) => {
      const workspace = await requireWorkspace(request.headers, params.slug);
      requirePermission(workspace.role, "team.manage");
      const nextRole = body.role as Role;
      if (!canManageRole(workspace.role, nextRole)) {
        throw new ApiError(
          403,
          "ROLE_NOT_MANAGEABLE",
          "You cannot assign that role.",
        );
      }
      const [target] = await db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.businessId, workspace.business.id),
            eq(memberships.userId, params.userId),
            eq(memberships.status, "active"),
          ),
        )
        .limit(1);
      if (!target) {
        throw new ApiError(404, "MEMBER_NOT_FOUND", "Member not found.");
      }
      if (!canManageRole(workspace.role, target.role as Role)) {
        throw new ApiError(
          403,
          "ROLE_NOT_MANAGEABLE",
          "You cannot change this member.",
        );
      }
      if (target.role === "Owner" && nextRole !== "Owner") {
        await ensureAnotherOwner(workspace.business.id, params.userId);
      }

      await db.transaction(async (tx) => {
        await tx
          .update(memberships)
          .set({ role: nextRole })
          .where(
            and(
              eq(memberships.businessId, workspace.business.id),
              eq(memberships.userId, params.userId),
              eq(memberships.status, "active"),
            ),
          );
        await tx.insert(auditLogs).values({
          id: randomUUID(),
          businessId: workspace.business.id,
          actorUserId: workspace.session.user.id,
          action: "team.member.role.update",
          targetType: "membership",
          targetId: params.userId,
          payload: { previousRole: target.role, role: nextRole },
        });
      });

      return { success: true };
    },
    {
      body: t.Object({
        role: t.Union([
          t.Literal("Owner"),
          t.Literal("Admin"),
          t.Literal("Manager"),
          t.Literal("Staff"),
          t.Literal("Viewer"),
        ]),
      }),
    },
  )
  .delete("/api/b/:slug/team/:userId", async ({ params, request }) => {
    const workspace = await requireWorkspace(request.headers, params.slug);
    requirePermission(workspace.role, "team.manage");
    const [target] = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.businessId, workspace.business.id),
          eq(memberships.userId, params.userId),
          eq(memberships.status, "active"),
        ),
      )
      .limit(1);
    if (!target) {
      throw new ApiError(404, "MEMBER_NOT_FOUND", "Member not found.");
    }
    if (!canManageRole(workspace.role, target.role as Role)) {
      throw new ApiError(
        403,
        "ROLE_NOT_MANAGEABLE",
        "You cannot remove this member.",
      );
    }
    if (target.role === "Owner") {
      await ensureAnotherOwner(workspace.business.id, params.userId);
    }

    await db.transaction(async (tx) => {
      await tx
        .update(memberships)
        .set({ status: "revoked", revokedAt: new Date() })
        .where(
          and(
            eq(memberships.businessId, workspace.business.id),
            eq(memberships.userId, params.userId),
            eq(memberships.status, "active"),
          ),
        );
      await tx.insert(auditLogs).values({
        id: randomUUID(),
        businessId: workspace.business.id,
        actorUserId: workspace.session.user.id,
        action: "team.member.revoke",
        targetType: "membership",
        targetId: params.userId,
        payload: { role: target.role },
      });
    });

    return { success: true };
  })
  .get("/api/invitations/:token", async ({ params }) => {
    const tokenHash = hashAuthToken(params.token);
    const [invitation] = await db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        expiresAt: invitations.expiresAt,
        acceptedAt: invitations.acceptedAt,
        revokedAt: invitations.revokedAt,
        businessName: businesses.name,
        businessSlug: businesses.slug,
        inviterName: users.name,
      })
      .from(invitations)
      .innerJoin(businesses, eq(invitations.businessId, businesses.id))
      .innerJoin(users, eq(invitations.invitedBy, users.id))
      .where(and(eq(invitations.tokenHash, tokenHash), isNull(businesses.deletedAt)))
      .limit(1);

    if (!invitation) {
      return { state: "invalid" as const };
    }

    return {
      state: invitationState(invitation),
      invitation: {
        id: invitation.id,
        businessName: invitation.businessName,
        businessSlug: invitation.businessSlug,
        email: maskEmail(invitation.email),
        expiresAt: invitation.expiresAt,
        inviterName: invitation.inviterName,
        role: invitation.role,
      },
    };
  })
  .post("/api/invitations/:token/accept", async ({ params, request }) => {
    const session = await requireSession(request.headers);
    const tokenHash = hashAuthToken(params.token);
    const [invitation] = await db
      .select({
        id: invitations.id,
        businessId: invitations.businessId,
        email: invitations.email,
        role: invitations.role,
        invitedBy: invitations.invitedBy,
        expiresAt: invitations.expiresAt,
        acceptedAt: invitations.acceptedAt,
        revokedAt: invitations.revokedAt,
        businessSlug: businesses.slug,
      })
      .from(invitations)
      .innerJoin(businesses, eq(invitations.businessId, businesses.id))
      .where(and(eq(invitations.tokenHash, tokenHash), isNull(businesses.deletedAt)))
      .limit(1);

    if (!invitation) {
      throw new ApiError(404, "INVALID_INVITATION", "Invitation not found.");
    }
    const state = invitationState(invitation);
    if (state !== "valid") {
      throw new ApiError(
        state === "expired" ? 410 : 409,
        `INVITATION_${state.toUpperCase()}`,
        `This invitation is ${state}.`,
      );
    }
    if (normalizeEmail(session.user.email) !== invitation.email) {
      throw new ApiError(
        403,
        "INVITATION_EMAIL_MISMATCH",
        "Sign in with the email address that was invited.",
      );
    }

    await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(invitations)
        .set({ acceptedAt: new Date() })
        .where(
          and(
            eq(invitations.id, invitation.id),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
            gt(invitations.expiresAt, new Date()),
          ),
        )
        .returning({ id: invitations.id });
      if (!claimed) {
        throw new ApiError(
          409,
          "INVITATION_UNAVAILABLE",
          "This invitation is no longer available.",
        );
      }
          const [membership] = await tx
            .insert(memberships)
            .values({
          userId: session.user.id,
          businessId: invitation.businessId,
          role: invitation.role as Role,
          status: "active",
          invitedBy: invitation.invitedBy,
          invitedAt: new Date(),
          joinedAt: new Date(),
          revokedAt: null,
        })
            .onConflictDoUpdate({
              target: [memberships.userId, memberships.businessId],
              setWhere: eq(memberships.status, "revoked"),
              set: {
            role: invitation.role as Role,
            status: "active",
            invitedBy: invitation.invitedBy,
            invitedAt: new Date(),
            joinedAt: new Date(),
                revokedAt: null,
              },
            })
            .returning({ userId: memberships.userId });
          if (!membership) {
            throw new ApiError(
              409,
              "ALREADY_A_MEMBER",
              "You are already an active member of this workspace.",
            );
          }
      await tx.insert(auditLogs).values({
        id: randomUUID(),
        businessId: invitation.businessId,
        actorUserId: session.user.id,
        action: "team.invite.accept",
        targetType: "invitation",
        targetId: invitation.id,
        payload: { role: invitation.role },
      });
    });

    return { success: true, businessSlug: invitation.businessSlug };
  });
