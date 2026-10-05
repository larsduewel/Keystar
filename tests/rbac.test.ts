import { describe, expect, it } from "vitest";
import { isHomeMember, mayRegister, policyRole, reconcileRole, type RolePolicyInput } from "@/core/auth/policy";
import { CORE_PERMISSIONS, effectiveMinRole, permissionsForRole, type PermissionDef } from "@/core/rbac/permissions";
import { assignableRoles, canManageRole, roleAtLeast } from "@/core/rbac/roles";

describe("roles", () => {
  it("is hierarchical", () => {
    expect(roleAtLeast("director", "viewer")).toBe(true);
    expect(roleAtLeast("member", "viewer")).toBe(false);
    expect(roleAtLeast("admin", "admin")).toBe(true);
  });

  it("lets admins manage anyone and others only strictly lower roles", () => {
    expect(canManageRole("admin", "admin")).toBe(true);
    expect(canManageRole("director", "contributor")).toBe(true);
    expect(canManageRole("director", "director")).toBe(false);
    expect(canManageRole("director", "admin")).toBe(false);
    expect(canManageRole("member", "guest")).toBe(true);
  });

  it("limits assignable roles to those below the actor (admins get all)", () => {
    expect(assignableRoles("admin")).toContain("admin");
    expect(assignableRoles("director")).toEqual(["guest", "member", "viewer", "contributor"]);
    expect(assignableRoles("guest")).toEqual([]);
  });
});

describe("permissions", () => {
  const defs: PermissionDef[] = [
    ...CORE_PERMISSIONS,
    { key: "mining.view.corp", label: () => "", description: () => "", group: () => "Mining", defaultMinRole: "viewer" },
  ];

  it("grants by minimum role", () => {
    const viewer = permissionsForRole("viewer", defs);
    expect(viewer.has("mining.view.corp")).toBe(true);
    expect(viewer.has("users.manage")).toBe(false);
    expect(permissionsForRole("director", defs).has("users.manage")).toBe(true);
  });

  it("gives admins every permission even if overridden upwards", () => {
    const admin = permissionsForRole("admin", defs, { "mining.view.corp": "admin" });
    expect(admin.size).toBe(defs.length);
  });

  it("applies overrides but never to locked permissions", () => {
    const overrides = { "mining.view.corp": "member" as const, "app.settings.manage": "member" as const };
    const member = permissionsForRole("member", defs, overrides);
    expect(member.has("mining.view.corp")).toBe(true);
    expect(member.has("app.settings.manage")).toBe(false);
    const locked = defs.find((d) => d.key === "app.settings.manage")!;
    expect(effectiveMinRole(locked, overrides)).toBe("admin");
  });
});

describe("role policy on sign-in", () => {
  const base: RolePolicyInput = {
    characterId: 1,
    corporationId: 100,
    allianceId: 500,
    adminCharacterIds: [],
    hasUsers: true,
    homeCorporationId: 100,
    homeAllianceId: 500,
    autoApproveCorpMembers: true,
    autoApproveAllianceMembers: false,
  };

  it("makes the very first user admin when no admin list is configured", () => {
    expect(policyRole({ ...base, hasUsers: false })).toBe("admin");
  });

  it("only uses ADMIN_CHARACTER_IDS when configured", () => {
    expect(policyRole({ ...base, hasUsers: false, adminCharacterIds: [99] })).toBe("member");
    expect(policyRole({ ...base, adminCharacterIds: [1] })).toBe("admin");
  });

  it("auto-approves home corp members and optionally alliance members", () => {
    expect(policyRole(base)).toBe("member");
    expect(policyRole({ ...base, corporationId: 200 })).toBe("guest");
    expect(policyRole({ ...base, corporationId: 200, autoApproveAllianceMembers: true })).toBe("member");
    expect(policyRole({ ...base, autoApproveCorpMembers: false })).toBe("guest");
  });

  it("counts corp members as members even without auto-approval, alliance members only with it", () => {
    expect(isHomeMember({ ...base, autoApproveCorpMembers: false })).toBe(true);
    expect(isHomeMember({ ...base, corporationId: 200 })).toBe(false);
    expect(isHomeMember({ ...base, corporationId: 200, autoApproveAllianceMembers: true })).toBe(true);
    expect(isHomeMember({ ...base, homeCorporationId: null })).toBe(false);
  });

  it("refuses new accounts for outsiders only while sign-ups are restricted", () => {
    const outsider = { ...base, corporationId: 200, allianceId: null };
    expect(mayRegister(outsider, false)).toBe(true);
    expect(mayRegister(outsider, true)).toBe(false);
    // Corp members still get in (as guests awaiting approval when auto-approval is off).
    expect(mayRegister({ ...base, autoApproveCorpMembers: false }, true)).toBe(true);
    // Configured admins and the very first user are never locked out.
    expect(mayRegister({ ...outsider, adminCharacterIds: [1] }, true)).toBe(true);
    expect(mayRegister({ ...outsider, hasUsers: false }, true)).toBe(true);
  });

  it("promotes but never demotes existing users", () => {
    expect(reconcileRole("guest", "member")).toBe("member");
    expect(reconcileRole("director", "guest")).toBe("director");
    expect(reconcileRole("viewer", "member")).toBe("viewer");
    expect(reconcileRole("member", "admin")).toBe("admin");
  });
});
