import { Scale } from "lucide-react";
import type { KeystarModule } from "@/core/modules/types";

export const TRADE_PERMISSIONS = {
  appraisal: "trade.appraisal",
} as const;

export const tradeModule: KeystarModule = {
  id: "trade",
  name: "Trade",
  description: "Appraise pasted items (cargo, contracts, fits, d-scan) at Jita 4-4 prices and share the result.",
  // Market prices are public: no ESI scopes needed.
  scopes: [],
  permissions: [
    {
      key: TRADE_PERMISSIONS.appraisal,
      label: (t) => t.trade.module.permissions.appraisal.label,
      description: (t) => t.trade.module.permissions.appraisal.description,
      group: (t) => t.trade.module.permissionGroup,
      defaultMinRole: "member",
    },
  ],
  nav: [
    {
      id: "trade",
      label: (t) => t.trade.module.navSection,
      order: 20,
      tone: "trade",
      items: [
        {
          href: "/trade/appraisal",
          label: (t) => t.trade.module.nav.appraisal,
          icon: Scale,
          help: (t) => t.trade.module.help.appraisal,
          anyPermission: [TRADE_PERMISSIONS.appraisal],
        },
      ],
    },
  ],
};
