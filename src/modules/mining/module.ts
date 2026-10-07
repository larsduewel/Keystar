import { Calculator, Gem, Pickaxe, ReceiptText, TableProperties } from "lucide-react";
import type { KeystarModule } from "@/core/modules/types";

/** The character's personal mining ledger: optional per character, switched on on the Mining access page. */
export const MINING_LEDGER_SCOPE = "esi-industry.read_character_mining.v1";
export const MINING_MANAGE_HREF = "/mining/settings";

export const MINING_PERMISSIONS = {
  viewOwn: "mining.view.own",
  viewCorp: "mining.view.corp",
  export: "mining.export",
  pnl: "mining.pnl",
} as const;

/**
 * Mining: personal ledgers and the corporation's moon drills. The personal ledger is opt-in per character (nobody is
 * asked for it at sign-up); corporation figures include the members who share it, plus moon-drill records.
 */
export const miningModule: KeystarModule = {
  id: "mining",
  name: "Mining",
  description: "Personal and moon-observer mining ledgers with volume, value and member breakdowns.",
  scopes: [
    {
      scope: MINING_LEDGER_SCOPE,
      level: "character",
      optional: true,
      manageHref: MINING_MANAGE_HREF,
      managePermission: MINING_PERMISSIONS.viewOwn,
      reason: (t) => t.mining.module.scopes.characterMining,
      label: (t) => t.mining.module.scopes.characterMiningLabel,
    },
    {
      scope: "esi-industry.read_corporation_mining.v1",
      level: "corporation",
      reason: (t) => t.mining.module.scopes.corporationMining,
      corpRoles: ["Accountant", "Director"],
    },
    {
      scope: "esi-corporations.read_structures.v1",
      level: "corporation",
      reason: (t) => t.mining.module.scopes.structures,
      corpRoles: ["Station_Manager", "Director"],
    },
  ],
  permissions: [
    {
      key: MINING_PERMISSIONS.viewOwn,
      label: (t) => t.mining.module.permissions.viewOwn.label,
      description: (t) => t.mining.module.permissions.viewOwn.description,
      group: (t) => t.mining.module.permissionGroup,
      defaultMinRole: "member",
    },
    {
      key: MINING_PERMISSIONS.viewCorp,
      label: (t) => t.mining.module.permissions.viewCorp.label,
      description: (t) => t.mining.module.permissions.viewCorp.description,
      group: (t) => t.mining.module.permissionGroup,
      defaultMinRole: "viewer",
    },
    {
      key: MINING_PERMISSIONS.export,
      label: (t) => t.mining.module.permissions.export.label,
      description: (t) => t.mining.module.permissions.export.description,
      group: (t) => t.mining.module.permissionGroup,
      defaultMinRole: "viewer",
    },
    {
      key: MINING_PERMISSIONS.pnl,
      label: (t) => t.mining.module.permissions.pnl.label,
      description: (t) => t.mining.module.permissions.pnl.description,
      group: (t) => t.mining.module.permissionGroup,
      defaultMinRole: "member",
    },
  ],
  nav: [
    {
      id: "industry",
      label: (t) => t.mining.module.navSection,
      order: 10,
      tone: "industry",
      items: [
        {
          href: "/mining",
          label: (t) => t.mining.module.nav.overview,
          icon: Pickaxe,
          help: (t) => t.mining.module.help.overview,
          anyPermission: ["mining.view.own", "mining.view.corp"],
        },
        {
          href: "/mining/ledger",
          label: (t) => t.mining.module.nav.ledger,
          icon: TableProperties,
          help: (t) => t.mining.module.help.ledger,
          anyPermission: ["mining.view.own", "mining.view.corp"],
        },
        {
          href: "/mining/observers",
          label: (t) => t.mining.module.nav.observers,
          icon: Gem,
          help: (t) => t.mining.module.help.observers,
          anyPermission: ["mining.view.corp"],
        },
        {
          href: "/mining/estimator",
          label: (t) => t.mining.module.nav.estimator,
          icon: Calculator,
          help: (t) => t.mining.module.help.estimator,
          anyPermission: ["mining.view.own", "mining.view.corp"],
        },
        {
          href: "/mining/pnl",
          label: (t) => t.mining.module.nav.pnl,
          icon: ReceiptText,
          help: (t) => t.mining.module.help.pnl,
          ownDataOnly: true,
          anyPermission: ["mining.pnl"],
        },
      ],
    },
  ],
};
