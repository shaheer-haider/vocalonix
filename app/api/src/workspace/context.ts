import { and, eq, isNull } from "drizzle-orm";

import { auth } from "../auth/config";
import { db } from "../db/client";
import { businesses, memberships, type Role } from "../db/schema";
import { ApiError } from "../errors";
import { can, type Permission } from "./permissions";

export async function requireSession(headers: Headers) {
  const result = await auth.api.getSession({ headers });
  if (!result) {
    throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
  }
  return result;
}

export async function requireWorkspace(headers: Headers, slug: string) {
  const session = await requireSession(headers);
  const [workspace] = await db
    .select({
      business: businesses,
      membership: memberships,
    })
    .from(businesses)
    .innerJoin(memberships, eq(memberships.businessId, businesses.id))
    .where(
      and(
        eq(businesses.slug, slug),
        isNull(businesses.deletedAt),
        eq(memberships.userId, session.user.id),
        eq(memberships.status, "active"),
      ),
    )
    .limit(1);

  if (!workspace) {
    throw new ApiError(404, "WORKSPACE_NOT_FOUND", "Workspace not found.");
  }

  return {
    session,
    business: workspace.business,
    membership: workspace.membership,
    role: workspace.membership.role as Role,
  };
}

export function requirePermission(role: Role, permission: Permission): void {
  if (!can(role, permission)) {
    throw new ApiError(
      403,
      "MISSING_PERMISSION",
      "You do not have permission to perform this action.",
    );
  }
}
