import { Package } from "lucide-react";
import type { KeystarModule } from "@/core/modules/types";
export const lootModule: KeystarModule = {
  id: "loot",
  name: "Fleet Loot",
  description: "Fleet loot ledger, valuations and settlement.",
  scopes: [],
  permissions: [
    {
      key: "loot.view",
      label: (t) => t.loot.title,
      description: (t) => t.loot.help,
      group: (t) => t.killboard.module.permissionGroup,
      defaultMinRole: "member",
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
          href: "/loot",
          label: (t) => t.loot.title,
          help: (t) => t.loot.help,
          icon: Package,
          anyPermission: ["loot.view"],
        },
      ],
    },
  ],
};
