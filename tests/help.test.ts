import { describe, expect, it } from "vitest";
import { matchNavItem } from "@/components/shell/nav-match";
import { accessRows, DATA_VISIBILITY, dataVisibility, minRoleFor, roleGrants, scopeGroups } from "@/core/help/access";
import { allPermissions, allScopeRequirements, characterScopes, navSections, optionalScopes } from "@/core/modules/registry";
import { CORE_PERMISSIONS, permissionsForRole, type PermissionDef } from "@/core/rbac/permissions";
import { ROLES, roleAtLeast } from "@/core/rbac/roles";
import { MESSAGES } from "@/i18n/messages";

const t = MESSAGES.en;
const defs: PermissionDef[] = [
  ...CORE_PERMISSIONS,
  { key: "mining.view.corp", label: () => "", description: () => "", group: () => "", defaultMinRole: "viewer" },
  { key: "mining.view.own", label: () => "", description: () => "", group: () => "", defaultMinRole: "member" },
];

describe("the role a page needs", () => {
  const plain = roleGrants(defs, {});

  it("is the lowest role with any of its permissions", () => {
    expect(minRoleFor(["mining.view.corp"], plain)).toBe("viewer");
    expect(minRoleFor(["mining.view.own", "mining.view.corp"], plain)).toBe("member");
    expect(minRoleFor(["users.view"], plain)).toBe("director");
  });

  it("is every signed-in account without a permission, and nobody for an unknown one", () => {
    expect(minRoleFor(undefined, plain)).toBe("guest");
    expect(minRoleFor([], plain)).toBe("guest");
    expect(minRoleFor(["no.such.permission"], plain)).toBeNull();
  });

  it("follows the overrides in Settings, except for locked permissions", () => {
    expect(minRoleFor(["mining.view.corp"], roleGrants(defs, { "mining.view.corp": "director" }))).toBe("director");
    expect(minRoleFor(["mining.view.corp"], roleGrants(defs, { "mining.view.corp": "guest" }))).toBe("guest");
    expect(minRoleFor(["app.settings.manage"], roleGrants(defs, { "app.settings.manage": "member" }))).toBe("admin");
  });
});

describe("the access table", () => {
  const all = allPermissions();
  const rows = (role: (typeof ROLES)[number], overrides = {}) => {
    const granted = permissionsForRole(role, all, overrides);
    return accessRows(navSections(), t, { grants: roleGrants(all, overrides), canAny: (...ps) => ps.some((p) => granted.has(p)) });
  };

  it("lists every sidebar page with its section and help", () => {
    const hrefs = navSections().flatMap((s) => s.items.map((i) => i.href));
    const table = rows("member");
    expect(table.map((r) => r.href)).toEqual(hrefs);
    for (const row of table) expect(row.label && row.section && row.help).toBeTruthy();
  });

  it.each(ROLES)("agrees with the sidebar for a %s", (role) => {
    for (const row of rows(role)) {
      // Allowed exactly when the role reaches the page's minimum role.
      expect(row.allowed, row.href).toBe(row.minRole !== null && roleAtLeast(role, row.minRole));
    }
  });

  it("marks the pages that only show the viewer's own data", () => {
    const own = rows("member").filter((r) => r.ownDataOnly).map((r) => r.href);
    expect(own).toEqual(expect.arrayContaining(["/mail", "/mining/pnl", "/industry", "/market"]));
    expect(own).not.toContain("/mining");
  });

  it("shows what the overrides allow", () => {
    const viewer = rows("viewer", { "wallet.corp.view": "viewer" }).find((r) => r.href === "/finances");
    expect(viewer).toMatchObject({ minRole: "viewer", allowed: true });
  });
});

describe("who else sees your data", () => {
  it("names a known permission for every row", () => {
    const keys = new Set(allPermissions().map((p) => p.key));
    for (const permission of Object.values(DATA_VISIBILITY).flat()) expect(keys).toContain(permission);
  });

  const visibility = (overrides = {}) =>
    Object.fromEntries(dataVisibility(roleGrants(allPermissions(), overrides)).map((v) => [v.key, v.minRole]));

  it("reads the role from the effective permission", () => {
    expect(visibility()).toMatchObject({ account: "director", mining: "viewer", audit: "director", scans: "member" });
    expect(visibility({ "mining.view.corp": "director" }).mining).toBe("director");
  });

  it("counts every page that shows the data: Member Audit shows token health too", () => {
    expect(visibility({ "members.audit": "viewer" }).account).toBe("viewer");
    expect(visibility({ "users.view": "contributor" }).account).toBe("contributor");
  });
});

describe("the scopes topic", () => {
  const groups = scopeGroups(allScopeRequirements(), t, () => true);

  it("lists the scopes everyone grants: none, every character scope is opt-in", () => {
    expect(groups.member.map((s) => s.scope).sort()).toEqual(characterScopes());
    expect(groups.member).toEqual([]);
  });

  it("offers the mining ledger on the Mining access page", () => {
    const mining = groups.optional.find((g) => g.href === "/mining/settings");
    expect(mining?.scopes.map((s) => s.scope)).toEqual(["esi-industry.read_character_mining.v1"]);
    expect(mining?.label).toBe(t.mining.module.scopes.characterMiningLabel);
  });

  it("groups the optional scopes by the page that switches them", () => {
    expect([...new Set(groups.optional.flatMap((g) => g.scopes.map((s) => s.scope)))].sort()).toEqual(optionalScopes());
    expect(new Set(groups.optional.map((g) => g.href)).size).toBe(groups.optional.length);
    // A scope two accesses share (structure names) is listed under each of them.
    const structures = groups.optional.filter((g) => g.scopes.some((s) => s.scope === "esi-universe.read_structures.v1"));
    expect(structures.map((g) => g.href).sort()).toEqual(["/industry/settings", "/market/settings"]);
    const skills = groups.optional.find((g) => g.href === "/skills/settings");
    const skillScopes = allScopeRequirements().filter((s) => s.optional && s.manageHref === "/skills/settings");
    expect(skills?.scopes.map((s) => s.scope)).toEqual(skillScopes.map((s) => s.scope));
    expect(skills?.scopes.length).toBeGreaterThan(1);
    expect(skills?.label).toBe(skillScopes[0]!.label!(t));
  });

  it("offers the switch only with the permission to use it", () => {
    const none = scopeGroups(allScopeRequirements(), t, () => false);
    expect(none.optional.every((g) => !g.canManage)).toBe(true);
  });

  it("names the in-game roles of corporation scopes", () => {
    const mining = groups.corporation.find((s) => s.scope === "esi-industry.read_corporation_mining.v1");
    expect(mining?.corpRoles).toEqual(["Accountant", "Director"]);
    expect(new Set(groups.corporation.map((s) => s.scope)).size).toBe(groups.corporation.length);
  });
});

describe("this page's help", () => {
  const items = navSections().flatMap((s) => s.items.map((i) => ({ href: i.href })));

  it.each([
    ["/", "/"],
    ["/mining", "/mining"],
    ["/mining/ledger", "/mining/ledger"],
    ["/mining/pnl/settings", "/mining/pnl"],
    ["/mining/settings", "/mining"],
    ["/industry/settings", "/industry"],
    ["/market/settings", "/market"],
    ["/skills/settings", "/skills"],
    ["/intel/abc123/pilot/42", "/intel"],
    ["/trade/appraisal/AbC123", "/trade/appraisal"],
  ])("explains %s with %s", (pathname, href) => {
    expect(matchNavItem(pathname, items)?.href).toBe(href);
  });

  it("has nothing for pages outside the sidebar", () => {
    expect(matchNavItem("/forbidden", items)).toBeUndefined();
  });
});
