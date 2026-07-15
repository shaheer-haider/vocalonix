import { describe, expect, test } from "bun:test";

import { can, canManageRole } from "./permissions";

describe("workspace permissions", () => {
  test("every role can view an active workspace", () => {
    for (const role of ["Owner", "Admin", "Manager", "Staff", "Viewer"] as const) {
      expect(can(role, "workspace.view")).toBe(true);
    }
  });

  test("only owners and admins can manage the team", () => {
    expect(can("Owner", "team.manage")).toBe(true);
    expect(can("Admin", "team.manage")).toBe(true);
    expect(can("Manager", "team.manage")).toBe(false);
    expect(can("Staff", "team.manage")).toBe(false);
    expect(can("Viewer", "team.manage")).toBe(false);
  });

  test("only owners can access billing and delete a business", () => {
    for (const role of ["Admin", "Manager", "Staff", "Viewer"] as const) {
      expect(can(role, "billing.access")).toBe(false);
      expect(can(role, "business.delete")).toBe(false);
    }
    expect(can("Owner", "billing.access")).toBe(true);
    expect(can("Owner", "business.delete")).toBe(true);
  });

  test("agent and knowledge editing stop at manager", () => {
    for (const role of ["Owner", "Admin", "Manager"] as const) {
      expect(can(role, "agent.edit")).toBe(true);
      expect(can(role, "knowledge.manage")).toBe(true);
    }
    for (const role of ["Staff", "Viewer"] as const) {
      expect(can(role, "agent.edit")).toBe(false);
      expect(can(role, "knowledge.manage")).toBe(false);
    }
  });

  test("admins cannot manage admins or owners", () => {
    expect(canManageRole("Admin", "Owner")).toBe(false);
    expect(canManageRole("Admin", "Admin")).toBe(false);
    expect(canManageRole("Admin", "Manager")).toBe(true);
    expect(canManageRole("Owner", "Owner")).toBe(true);
  });
});
