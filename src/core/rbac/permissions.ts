import type { Msg } from "@/i18n/messages";
import { ROLE_LEVEL, type Role } from "./roles";

/**
 * A permission is a named capability with a default minimum role. Modules
 * contribute their own permissions; admins can raise or lower the minimum role
 * per permission in Settings (except `locked` ones). Isomorphic.
 */
export interface PermissionDef {
  key: string;
  label: Msg;
  description: Msg;
  /** Grouping shown in the settings matrix (usually the module name). */
  group: Msg;
  defaultMinRole: Role;
  /** Locked permissions cannot be overridden (prevents admin lock-out). */
  locked?: boolean;
}

export type PermissionOverrides = Record<string, Role>;

export const CORE_PERMISSIONS = [
  {
    key: "app.settings.manage",
    label: (t) => t.core.permissions.settingsManage.label,
    description: (t) => t.core.permissions.settingsManage.description,
    group: (t) => t.core.permissionGroup,
    defaultMinRole: "admin",
    locked: true,
  },
  {
    key: "users.view",
    label: (t) => t.core.permissions.usersView.label,
    description: (t) => t.core.permissions.usersView.description,
    group: (t) => t.core.permissionGroup,
    defaultMinRole: "director",
  },
  {
    key: "users.manage",
    label: (t) => t.core.permissions.usersManage.label,
    description: (t) => t.core.permissions.usersManage.description,
    group: (t) => t.core.permissionGroup,
    defaultMinRole: "director",
  },
  {
    key: "members.audit",
    label: (t) => t.core.permissions.membersAudit.label,
    description: (t) => t.core.permissions.membersAudit.description,
    group: (t) => t.core.permissionGroup,
    defaultMinRole: "director",
  },
  {
    key: "audit.view",
    label: (t) => t.core.permissions.auditView.label,
    description: (t) => t.core.permissions.auditView.description,
    group: (t) => t.core.permissionGroup,
    defaultMinRole: "director",
  },
  {
    key: "sync.view",
    label: (t) => t.core.permissions.syncView.label,
    description: (t) => t.core.permissions.syncView.description,
    group: (t) => t.core.permissionGroup,
    defaultMinRole: "contributor",
  },
  {
    key: "sync.trigger",
    label: (t) => t.core.permissions.syncTrigger.label,
    description: (t) => t.core.permissions.syncTrigger.description,
    group: (t) => t.core.permissionGroup,
    defaultMinRole: "contributor",
  },
  {
    key: "system.view",
    label: (t) => t.core.permissions.systemView.label,
    description: (t) => t.core.permissions.systemView.description,
    group: (t) => t.core.permissionGroup,
    defaultMinRole: "admin",
    locked: true,
  },
] as const satisfies readonly PermissionDef[];

export function effectiveMinRole(def: PermissionDef, overrides: PermissionOverrides): Role {
  if (def.locked) return def.defaultMinRole;
  return overrides[def.key] ?? def.defaultMinRole;
}

/** Computes the full set of permission keys granted to `role`. */
export function permissionsForRole(
  role: Role,
  defs: readonly PermissionDef[],
  overrides: PermissionOverrides = {},
): Set<string> {
  const granted = new Set<string>();
  for (const def of defs) {
    if (role === "admin" || ROLE_LEVEL[role] >= ROLE_LEVEL[effectiveMinRole(def, overrides)]) {
      granted.add(def.key);
    }
  }
  return granted;
}
