import { Swords } from "lucide-react";
import type { KeystarModule } from "@/core/modules/types";

export const KILLBOARD_PERMISSIONS = {
  view: "killboard.view",
  manage: "killboard.manage",
} as const;

export const killboardModule: KeystarModule = {
  id: "killboard",
  name: "Killboard",
  description: "Combat performance of the home corporation from zKillboard, with a weekly situation report.",
  // zKillboard data is public: no ESI scopes or tokens needed.
  scopes: [],
  permissions: [
    {
      key: KILLBOARD_PERMISSIONS.view,
      label: (t) => t.killboard.module.permissions.view.label,
      description: (t) => t.killboard.module.permissions.view.description,
      group: (t) => t.killboard.module.permissionGroup,
      defaultMinRole: "member",
    },
    {
      key: KILLBOARD_PERMISSIONS.manage,
      label: (t) => t.killboard.module.permissions.manage.label,
      description: (t) => t.killboard.module.permissions.manage.description,
      group: (t) => t.killboard.module.permissionGroup,
      defaultMinRole: "director",
    },
  ],
  alerts: [
    {
      id: "killboard.kills",
      label: (t) => t.killboard.module.alerts.kills.label,
      hint: (t) => t.killboard.module.alerts.kills.hint,
      anyPermission: [KILLBOARD_PERMISSIONS.view],
      available: (settings) => Boolean(settings["corp.homeCorporationId"]),
    },
  ],
  nav: [
    {
      id: "combat",
      label: (t) => t.killboard.module.navSection,
      order: 15,
      tone: "combat",
      items: [
        {
          href: "/killboard",
          label: (t) => t.killboard.module.nav.killboard,
          icon: Swords,
          help: (t) => t.killboard.module.help.killboard,
          anyPermission: [KILLBOARD_PERMISSIONS.view],
        },
      ],
    },
  ],
};
