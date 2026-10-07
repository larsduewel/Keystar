import type { NavSection, ScopeRequirement } from "@/core/modules/types";
import { permissionsForRole, type PermissionDef, type PermissionOverrides } from "@/core/rbac/permissions";
import { ROLES, type Role } from "@/core/rbac/roles";
import type { Messages } from "@/i18n/messages";

/*
 * The help's "Who sees what" and "Scopes" topics, computed from the module manifests and the
 * permission overrides in Settings, so the help can't drift from what Keystar enforces. Pure.
 */

/** Each role's permissions with the overrides in Settings applied; built once, read by minRoleFor. */
export type RoleGrants = ReadonlyMap<Role, ReadonlySet<string>>;

export function roleGrants(defs: readonly PermissionDef[], overrides: PermissionOverrides): RoleGrants {
  return new Map(ROLES.map((role) => [role, permissionsForRole(role, defs, overrides)]));
}

/**
 * The lowest role with any of `anyPermission`: "guest" when there are none (a page every signed-in
 * account sees, like the sidebar), null when no role has any of them.
 */
export function minRoleFor(anyPermission: readonly string[] | undefined, grants: RoleGrants): Role | null {
  if (!anyPermission?.length) return "guest";
  return ROLES.find((role) => anyPermission.some((p) => grants.get(role)?.has(p))) ?? null;
}

export interface AccessRow {
  href: string;
  label: string;
  section: string;
  /** The page's help text (NavItem.help). */
  help: string;
  minRole: Role | null;
  /** The viewer may open it (the sidebar's rule). */
  allowed: boolean;
  ownDataOnly: boolean;
}

/** Every page in the sidebar, with the role it needs and whether the viewer has it. */
export function accessRows(
  sections: readonly NavSection[],
  t: Messages,
  opts: { grants: RoleGrants; canAny: (...permissions: string[]) => boolean },
): AccessRow[] {
  return sections.flatMap((section) =>
    section.items.map((item) => ({
      href: item.href,
      label: item.label(t),
      section: section.label(t),
      help: item.help(t),
      minRole: minRoleFor(item.anyPermission, opts.grants),
      allowed: !item.anyPermission || opts.canAny(...item.anyPermission),
      ownDataOnly: Boolean(item.ownDataOnly),
    })),
  );
}

/**
 * Who else can see a member's data, each by the permissions of the pages that show it (any of them;
 * the texts are `help.data.visibility.rows`).
 */
export const DATA_VISIBILITY = {
  account: ["users.view", "members.audit"],
  mining: ["mining.view.corp"],
  skills: ["skills.view.corp"],
  audit: ["audit.view"],
  scans: ["intel.use"],
  appraisals: ["trade.appraisal"],
} as const satisfies Record<string, readonly string[]>;

export type DataVisibilityKey = keyof typeof DATA_VISIBILITY;

export function dataVisibility(grants: RoleGrants): { key: DataVisibilityKey; minRole: Role | null }[] {
  return (Object.keys(DATA_VISIBILITY) as DataVisibilityKey[]).map((key) => ({ key, minRole: minRoleFor(DATA_VISIBILITY[key], grants) }));
}

export interface ScopeRow {
  scope: string;
  reason: string;
}

export interface ScopeGroups {
  /** Asked from everyone who registers or links a character. */
  member: ScopeRow[];
  /** Opt-in per character, switched on and off on their page. */
  optional: { href: string; label: string; scopes: ScopeRow[]; canManage: boolean }[];
  /** Only for corporation data; useful with one of the in-game roles. */
  corporation: (ScopeRow & { corpRoles: string[] })[];
}

/** The scopes Keystar can ask for, grouped by when it asks. */
export function scopeGroups(reqs: readonly ScopeRequirement[], t: Messages, can: (permission: string) => boolean): ScopeGroups {
  const once = <T extends { scope: string }>(rows: T[]) => rows.filter((r, i) => rows.findIndex((o) => o.scope === r.scope) === i);
  const row = (s: ScopeRequirement): ScopeRow => ({ scope: s.scope, reason: s.reason(t) });

  // The same sets as the registry's (memberScopeRequirements, optionalScopes, corporationScopes), each scope once.
  const optional = new Map<string, ScopeGroups["optional"][number]>();
  for (const s of reqs.filter((r) => r.optional)) {
    const href = s.manageHref ?? "/characters";
    const group = optional.get(href) ?? { href, label: "", scopes: [], canManage: true };
    if (group.scopes.some((r) => r.scope === s.scope)) continue;
    group.scopes.push(row(s));
    // Named after its first scope ("Skill queue access"); the rows explain each scope.
    group.label ||= s.label?.(t) ?? s.scope;
    group.canManage &&= !s.managePermission || can(s.managePermission);
    optional.set(href, group);
  }

  return {
    member: once(reqs.filter((r) => r.level === "character" && !r.optional).map(row)),
    optional: [...optional.values()],
    corporation: once(reqs.filter((r) => r.level === "corporation" && !r.optional).map((s) => ({ ...row(s), corpRoles: s.corpRoles ?? [] }))),
  };
}
