import type { Role } from "./api";

export type Permission =
  | "workspace.view"
  | "team.manage"
  | "billing.access"
  | "business.delete"
  | "agent.edit"
  | "knowledge.manage";

const permissions: Record<Permission, readonly Role[]> = {
  "workspace.view": ["Owner", "Admin", "Manager", "Staff", "Viewer"],
  "team.manage": ["Owner", "Admin"],
  "billing.access": ["Owner"],
  "business.delete": ["Owner"],
  "agent.edit": ["Owner", "Admin", "Manager"],
  "knowledge.manage": ["Owner", "Admin", "Manager"],
};

export function can(role: Role | undefined, permission: Permission): boolean {
  return role ? permissions[permission].includes(role) : false;
}

export const roles: Role[] = ["Owner", "Admin", "Manager", "Staff", "Viewer"];

export const permissionRows = [
  { label: "View workspace", permission: "workspace.view" },
  { label: "Manage team", permission: "team.manage" },
  { label: "Edit agent", permission: "agent.edit" },
  { label: "Manage knowledge", permission: "knowledge.manage" },
  { label: "Access billing", permission: "billing.access" },
  { label: "Delete business", permission: "business.delete" },
] as const;
