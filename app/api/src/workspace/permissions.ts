import type { Role } from "../db/schema";

export type Permission =
  | "workspace.view"
  | "team.manage"
  | "billing.access"
  | "business.delete"
  | "agent.edit"
  | "knowledge.manage";

export const roleRank: Record<Role, number> = {
  Owner: 5,
  Admin: 4,
  Manager: 3,
  Staff: 2,
  Viewer: 1,
};

const matrix: Record<Permission, readonly Role[]> = {
  "workspace.view": ["Owner", "Admin", "Manager", "Staff", "Viewer"],
  "team.manage": ["Owner", "Admin"],
  "billing.access": ["Owner"],
  "business.delete": ["Owner"],
  "agent.edit": ["Owner", "Admin", "Manager"],
  "knowledge.manage": ["Owner", "Admin", "Manager"],
};

export function can(role: Role, permission: Permission): boolean {
  return matrix[permission].includes(role);
}

export function canManageRole(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === "Owner") return true;
  return roleRank[actorRole] > roleRank[targetRole];
}
