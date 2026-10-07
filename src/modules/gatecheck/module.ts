import { Route } from "lucide-react";
import type { KeystarModule } from "@/core/modules/types";

export const GATECHECK_PERMISSIONS = {
  use: "gatecheck.use",
} as const;

/**
 * Route planning with live gate kills and camp estimates. Public data only
 * (zKillboard's feed, CCP's static data), so every role may use it.
 */
export const gatecheckModule: KeystarModule = {
  id: "gatecheck",
  name: "Gate check",
  description: "Stargate routes with live kills at their gates and camp estimates.",
  scopes: [],
  permissions: [
    {
      key: GATECHECK_PERMISSIONS.use,
      label: (t) => t.gatecheck.module.permissions.use.label,
      description: (t) => t.gatecheck.module.permissions.use.description,
      group: (t) => t.gatecheck.module.permissionGroup,
      defaultMinRole: "guest",
    },
  ],
  nav: [
    {
      id: "combat",
      label: (t) => t.killboard.module.navSection,
      order: 15,
      items: [
        {
          href: "/gatecheck",
          label: (t) => t.gatecheck.module.navItem,
          icon: Route,
          help: (t) => t.gatecheck.module.help,
          anyPermission: [GATECHECK_PERMISSIONS.use],
        },
      ],
    },
  ],
};
