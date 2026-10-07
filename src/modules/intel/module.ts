import { ScanEye } from "lucide-react";
import type { KeystarModule } from "@/core/modules/types";

export const INTEL_PERMISSIONS = {
  use: "intel.use",
  ai: "intel.ai",
  manage: "intel.manage",
} as const;

export const intelModule: KeystarModule = {
  id: "intel",
  name: "Threat intel",
  description: "Threat assessment for pasted pilot lists from zKillboard, the corporation's own fights and its standings.",
  scopes: [
    {
      scope: "esi-corporations.read_contacts.v1",
      level: "corporation",
      reason: (t) => t.intel.module.scopes.corporationContacts,
    },
    {
      scope: "esi-alliances.read_contacts.v1",
      level: "corporation",
      reason: (t) => t.intel.module.scopes.allianceContacts,
    },
  ],
  permissions: [
    {
      key: INTEL_PERMISSIONS.use,
      label: (t) => t.intel.module.permissions.use.label,
      description: (t) => t.intel.module.permissions.use.description,
      group: (t) => t.intel.module.permissionGroup,
      defaultMinRole: "member",
    },
    {
      key: INTEL_PERMISSIONS.ai,
      label: (t) => t.intel.module.permissions.ai.label,
      description: (t) => t.intel.module.permissions.ai.description,
      group: (t) => t.intel.module.permissionGroup,
      defaultMinRole: "member",
    },
    {
      key: INTEL_PERMISSIONS.manage,
      label: (t) => t.intel.module.permissions.manage.label,
      description: (t) => t.intel.module.permissions.manage.description,
      group: (t) => t.intel.module.permissionGroup,
      defaultMinRole: "director",
    },
  ],
  nav: [
    {
      id: "combat",
      label: (t) => t.killboard.module.navSection,
      order: 15,
      items: [
        {
          href: "/intel",
          label: (t) => t.intel.module.navItem,
          icon: ScanEye,
          help: (t) => t.intel.module.help,
          anyPermission: [INTEL_PERMISSIONS.use],
        },
      ],
    },
  ],
};
