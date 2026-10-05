import { Activity, Gauge, Info, ScrollText, Settings, ShieldCheck, UserRoundCog, Users } from "lucide-react";
import { CORE_PERMISSIONS } from "@/core/rbac/permissions";
import type { KeystarModule } from "./types";

/** Built-in features: accounts, characters, administration. */
export const coreModule: KeystarModule = {
  id: "core",
  name: "Core",
  description: "Accounts, characters, ESI tokens, roles and administration.",
  scopes: [
    {
      scope: "esi-characters.read_corporation_roles.v1",
      level: "corporation",
      reason: (t) => t.core.scopes.corporationRoles,
    },
    {
      scope: "esi-corporations.read_corporation_membership.v1",
      level: "corporation",
      reason: (t) => t.core.scopes.corporationMembership,
    },
  ],
  permissions: [...CORE_PERMISSIONS],
  nav: [
    {
      id: "overview",
      label: (t) => t.shell.navSections.overview,
      order: 0,
      items: [{ href: "/", label: (t) => t.shell.nav.dashboard, icon: Gauge }],
    },
    {
      id: "account",
      label: (t) => t.shell.navSections.account,
      order: 90,
      items: [{ href: "/characters", label: (t) => t.shell.nav.characters, icon: UserRoundCog }],
    },
    {
      id: "admin",
      label: (t) => t.shell.navSections.admin,
      order: 100,
      items: [
        { href: "/admin/users", label: (t) => t.shell.nav.users, icon: Users, anyPermission: ["users.view"] },
        { href: "/admin/members", label: (t) => t.shell.nav.members, icon: ShieldCheck, anyPermission: ["members.audit"] },
        { href: "/admin/sync", label: (t) => t.shell.nav.sync, icon: Activity, anyPermission: ["sync.view"] },
        { href: "/admin/settings", label: (t) => t.shell.nav.settings, icon: Settings, anyPermission: ["app.settings.manage"] },
        { href: "/admin/audit", label: (t) => t.shell.nav.audit, icon: ScrollText, anyPermission: ["audit.view"] },
        { href: "/admin/system", label: (t) => t.shell.nav.system, icon: Info, anyPermission: ["system.view"] },
      ],
    },
  ],
};
